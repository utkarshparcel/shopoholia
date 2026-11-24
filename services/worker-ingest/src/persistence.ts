import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@worn/db";
import {
  ingestionDocuments,
  ingestionSources,
  merchantPurchaseItems,
  merchantPurchases,
} from "@worn/db";
import {
  computeExchangeWindowDeadline,
  computeReturnWindowDeadline,
  defaultEtaForStatus,
  detectDeliveryFromText,
} from "@worn/shared";
import type { ParsedPurchase, RawEmailMessage } from "./parsers/types.js";

/** Hook for persisting a parsed purchase into `merchant_purchases` /
 * `merchant_purchase_items` (B3/B4 downstream). Typed against `@worn/db`
 * so the contract is real without coupling the scaffold to a live client. */
export type PurchaseInserter = (db: Db, purchase: ParsedPurchase) => Promise<void>;

export type IngestSourceKind = "EMAIL" | "SMS" | "RECEIPT" | "MANUAL";

/**
 * Persistence surface used by `processIngestJob`. Decouples the parse loop from
 * the storage backend so it can be faked in tests and backed by `@worn/db` in
 * production via `createDbPersister`.
 */
export interface IngestPersister {
  insertPurchase(
    purchase: ParsedPurchase,
    opts: { sourceKind: IngestSourceKind; rawDocId?: string; userId?: string },
  ): Promise<string>;
  markDocument(
    documentId: string,
    status: "MATCHED" | "PARSED" | "UNMATCHED" | "ERROR",
    matchedPurchaseId?: string,
  ): Promise<void>;
  updateSourceCursor(sourceId: string, cursor: string): Promise<void>;
}

function now(): Date {
  return new Date();
}

const DELIVERY_ORDER = ["ORDERED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

/** How far along a delivery status is; FAILED and CANCELLED end the order, so they rank last. */
function deliveryRank(status: string): number {
  const i = DELIVERY_ORDER.indexOf(status);
  return i === -1 ? DELIVERY_ORDER.length : i;
}

/** DB-backed implementation of {@link IngestPersister}. */
export function createDbPersister(db: Db): IngestPersister {
  return {
    /**
     * One transaction: the purchase, its items and (with `rawDocId`) the document's MATCHED
     * link commit together. A retry for a document that is already matched returns the
     * existing purchase instead of inserting a second one (the document row is locked).
     */
    async insertPurchase(purchase, opts) {
      if (!opts.userId) {
        // No owner means no purchase: never attribute a purchase to a placeholder user.
        throw new Error("insertPurchase: userId is required");
      }
      const userId = opts.userId;
      const purchaseId = randomUUID();
      const purchasedAt = new Date(purchase.purchasedAt);
      const deliveryStatus = purchase.deliveryStatus ?? "ORDERED";
      const etaAt =
        (purchase.etaAt ? new Date(purchase.etaAt) : null) ??
        defaultEtaForStatus(deliveryStatus, purchasedAt);
      const returnWindowDeadline = computeReturnWindowDeadline(
        purchasedAt,
        purchase.merchant,
      );
      const exchangeWindowDeadline = computeExchangeWindowDeadline(
        purchasedAt,
        purchase.merchant,
      );

      return db.transaction(async (tx) => {
        if (opts.rawDocId) {
          const [doc] = await tx
            .select({ matchedPurchaseId: ingestionDocuments.matchedPurchaseId })
            .from(ingestionDocuments)
            .where(eq(ingestionDocuments.id, opts.rawDocId))
            .for("update");
          if (doc?.matchedPurchaseId) return doc.matchedPurchaseId;
        }

        const inserted = await tx
          .insert(merchantPurchases)
          .values({
            id: purchaseId,
            userId,
            source: opts.sourceKind,
            merchant: purchase.merchant,
            orderRef: purchase.orderRef ?? null,
            purchasedAt,
            currency: purchase.currency,
            totalMinor: purchase.totalMinor,
            status: "CONFIRMED",
            rawDocId: opts.rawDocId ?? null,
            deliveryStatus,
            etaAt,
            trackingCode: purchase.trackingCode ?? null,
            deliveredAt: deliveryStatus === "DELIVERED" ? purchasedAt : null,
            returnWindowDeadline,
            exchangeWindowDeadline,
          })
          // A second email about the same order ("placed", then "shipped") is the same purchase:
          // one per (user, merchant, order_ref), as the API's createMerchantPurchase does.
          .onConflictDoNothing({
            target: [merchantPurchases.userId, merchantPurchases.merchant, merchantPurchases.orderRef],
            where: sql`${merchantPurchases.orderRef} IS NOT NULL`,
          })
          .returning({ id: merchantPurchases.id });

        if (inserted.length === 0) {
          const [existing] = await tx
            .select({ id: merchantPurchases.id, deliveryStatus: merchantPurchases.deliveryStatus })
            .from(merchantPurchases)
            .where(
              and(
                eq(merchantPurchases.userId, userId),
                eq(merchantPurchases.merchant, purchase.merchant),
                eq(merchantPurchases.orderRef, purchase.orderRef ?? ""),
              ),
            )
            .limit(1);
          if (!existing) throw new Error("insertPurchase: order_ref conflict but no purchase found");
          // The later email moves delivery on (placed → shipped → delivered), never back.
          if (deliveryRank(deliveryStatus) > deliveryRank(existing.deliveryStatus)) {
            await tx
              .update(merchantPurchases)
              .set({
                deliveryStatus,
                etaAt,
                ...(purchase.trackingCode ? { trackingCode: purchase.trackingCode } : {}),
                ...(deliveryStatus === "DELIVERED" ? { deliveredAt: purchasedAt } : {}),
                updatedAt: now(),
              })
              .where(eq(merchantPurchases.id, existing.id));
          }
          if (opts.rawDocId) {
            await tx
              .update(ingestionDocuments)
              .set({ status: "MATCHED", matchedPurchaseId: existing.id, userId, updatedAt: now() })
              .where(eq(ingestionDocuments.id, opts.rawDocId));
          }
          return existing.id;
        }

        if (purchase.items.length > 0) {
          await tx.insert(merchantPurchaseItems).values(
            purchase.items.map((item) => ({
              id: randomUUID(),
              purchaseId,
              title: item.title,
              category: item.category ?? null,
              brand: item.brand ?? null,
              priceMinor: item.priceMinor,
              imageKey: item.imageKey ?? null,
              qty: item.qty,
            })),
          );
        }
        if (opts.rawDocId) {
          await tx
            .update(ingestionDocuments)
            .set({ status: "MATCHED", matchedPurchaseId: purchaseId, userId, updatedAt: now() })
            .where(eq(ingestionDocuments.id, opts.rawDocId));
        }
        return purchaseId;
      });
    },

    async markDocument(documentId, status, matchedPurchaseId) {
      await db
        .update(ingestionDocuments)
        .set({
          status,
          matchedPurchaseId: matchedPurchaseId ?? null,
          updatedAt: now(),
        })
        .where(eq(ingestionDocuments.id, documentId));
    },

    async updateSourceCursor(sourceId, cursor) {
      await db
        .update(ingestionSources)
        .set({ cursor, lastSyncAt: now(), updatedAt: now() })
        .where(eq(ingestionSources.id, sourceId));
    },
  };
}

/** Converts an SMS `ingestion_documents.parsedJson` into a normalized message. */
export function smsToRawMessage(doc: {
  id: string;
  parsedJson: Record<string, unknown>;
}): RawEmailMessage {
  const { from, body, receivedAt } = doc.parsedJson as {
    from?: string;
    body?: string;
    receivedAt?: string;
  };
  return {
    messageId: doc.id,
    from: from ?? "unknown",
    to: "",
    subject: `SMS from ${from ?? "unknown"}`,
    text: body ?? "",
    receivedAt: receivedAt ?? new Date().toISOString(),
  };
}

/** Attach delivery fields from subject/body onto a parsed purchase. */
export function enrichPurchaseDelivery(
  purchase: ParsedPurchase,
  subject: string,
  text: string,
): ParsedPurchase {
  const detected = detectDeliveryFromText(subject, text);
  return {
    ...purchase,
    deliveryStatus: purchase.deliveryStatus ?? detected.deliveryStatus,
    etaAt: purchase.etaAt ?? detected.etaAt,
    trackingCode: purchase.trackingCode ?? detected.trackingCode,
  };
}
