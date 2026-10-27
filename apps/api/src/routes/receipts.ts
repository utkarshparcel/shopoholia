import { randomUUID } from "node:crypto";
import {
  ConfirmReceiptBodySchema,
  PatchReceiptBodySchema,
  ReceiptListResponseSchema,
  ReceiptParsedSchema,
  ReceiptResponseSchema,
  ReceiptSearchQuerySchema,
  ReceiptExportFormatSchema,
  ReceiptExportResponseSchema,
  WarrantyListResponseSchema,
  ClaimWarrantyResponseSchema,
  SnoozeWarrantyBodySchema,
  SnoozeWarrantyResponseSchema,
  WarrantySchema,
  buildWarrantyClaimUrl,
  buildWarrantyClaimPacket,
  canUnclaimWarranty,
  warrantyUnclaimExpiredCopy,
  defaultClaimContactFromMerchant,
  inferWarrantyCategory,
  coverageUntilFromCategory,
  draftWarrantiesFromCategoryRules,
  filterReceiptsForSearch,
  readReceiptGstin,
  buildInvoicePdfBytes,
  formatMinor,
  type WarrantyCategory,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { requireConsent } from "../lib/auth/consent.js";
import { audit } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import {
  scheduleWarrantyReminders,
  snoozeWarrantyReminder,
  WARRANTY_SNOOZE_DEFAULT_MS,
} from "../lib/expiry.js";
import { sendSpendEnvelopeAlerts } from "../lib/budget.js";
import type { CreateWarrantyInput } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

type ReceiptItem = { title: string; priceMinor: number; category?: string };

function readConfidence(ocrJson: Record<string, unknown>, fallback = 0.5): number {
  const c = ocrJson.confidence;
  return typeof c === "number" && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : fallback;
}

function readItems(ocrJson: Record<string, unknown>): ReceiptItem[] {
  const raw = ocrJson.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as { title?: unknown; priceMinor?: unknown; category?: unknown };
    return {
      title: String(row.title ?? "Item"),
      priceMinor: Number(row.priceMinor ?? 0),
      ...(typeof row.category === "string" ? { category: row.category } : {}),
    };
  });
}

function toReceiptParsed(r: {
  id: string;
  userId: string;
  imageKey: string;
  merchant: string;
  purchasedAt: Date;
  totalMinor: number;
  ocrJson: Record<string, unknown>;
  purchaseId: string | null;
  items: ReceiptItem[];
  currency: string;
  imageUrl: string;
  confidence?: number | null;
  warrantyHint?: { itemIndex: number; months: number } | null;
  claimContactHint?: string | null;
}) {
  return {
    id: r.id,
    userId: r.userId,
    imageUrl: r.imageUrl,
    merchant: r.merchant,
    purchasedAt: r.purchasedAt.toISOString(),
    totalMinor: r.totalMinor,
    currency: r.currency,
    items: r.items.map((i) => ({
      title: i.title,
      priceMinor: i.priceMinor,
      category: i.category,
    })),
    ocrJson: r.ocrJson,
    purchaseId: r.purchaseId,
    confidence:
      typeof r.confidence === "number" ? r.confidence : readConfidence(r.ocrJson),
    warrantyHint:
      r.warrantyHint ??
      (r.ocrJson as { warrantyHint?: { itemIndex: number; months: number } | null })
        .warrantyHint ??
      null,
    claimContactHint:
      r.claimContactHint ??
      (r.ocrJson as { claimContactHint?: string | null }).claimContactHint ??
      null,
    gstin: readReceiptGstin(r),
  };
}

function toReceiptResponse(r: {
  id: string;
  merchant: string;
  purchasedAt: Date;
  totalMinor: number;
  currency: string;
  imageKey: string;
  purchaseId: string | null;
  createdAt: Date;
  imageUrl: string;
  ocrJson?: Record<string, unknown>;
  confidence?: number | null;
}) {
  return {
    id: r.id,
    merchant: r.merchant,
    purchasedAt: r.purchasedAt.toISOString(),
    totalMinor: r.totalMinor,
    currency: r.currency,
    imageUrl: r.imageUrl,
    purchaseId: r.purchaseId,
    createdAt: r.createdAt.toISOString(),
    confidence:
      typeof r.confidence === "number"
        ? r.confidence
        : readConfidence(r.ocrJson ?? {}),
    gstin: readReceiptGstin({ ocrJson: r.ocrJson ?? null }),
  };
}

function toWarrantyJson(w: {
  id: string;
  userId: string;
  receiptId: string | null;
  itemTitle: string;
  provider: string;
  coverageUntil: Date;
  claimContact: string | null;
  category?: string | null;
  state: "ACTIVE" | "CLAIMED" | "EXPIRED";
  createdAt: Date;
}) {
  const category: "electronics" | "appliances" | "apparel" | null =
    w.category === "electronics" ||
    w.category === "appliances" ||
    w.category === "apparel"
      ? w.category
      : null;
  return {
    id: w.id,
    userId: w.userId,
    receiptId: w.receiptId,
    itemTitle: w.itemTitle,
    provider: w.provider,
    coverageUntil: w.coverageUntil.toISOString(),
    claimContact: w.claimContact,
    category,
    state: w.state,
    createdAt: w.createdAt.toISOString(),
  };
}

export const receiptsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/receipts",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["receipts"],
        consumes: ["multipart/form-data"],
        response: {
          201: ReceiptParsedSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const parts = request.files();

      let imageKey: string | null = null;
      for await (const part of parts) {
        if (part.type !== "file") continue;
        const buffer = await part.toBuffer();
        if (buffer.length === 0) continue;
        const key = `receipts/${userId}/${randomUUID()}.jpg`;
        await app.deps.storage.put({
          key,
          body: buffer,
          contentType: part.mimetype || "image/jpeg",
        });
        imageKey = key;
        break;
      }

      if (!imageKey) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "A receipt image file is required",
        });
      }

      const parsed = await app.deps.ocr.recognize(imageKey);
      const totalMinor =
        parsed.totalMinor ??
        parsed.items.reduce((sum, i) => sum + i.priceMinor, 0);
      const merchant = parsed.merchant ?? "Unknown Merchant";
      const confidence = parsed.confidence;

      const ocrJson = {
        ...parsed.raw,
        items: parsed.items,
        confidence,
        warrantyHint: parsed.warrantyHint ?? null,
        claimContactHint: parsed.claimContactHint ?? null,
        gstin: parsed.gstin ?? null,
      };
      const receipt = await app.deps.repos.createReceipt({
        userId,
        imageKey,
        merchant,
        purchasedAt: new Date(),
        totalMinor,
        ocrJson,
      });

      audit(app.log, "receipt.uploaded", { userId, receiptId: receipt.id });
      trackServerEvent("receipt_uploaded", { userId, receiptId: receipt.id });

      const imageUrl = await app.deps.storage.getSignedUrl(receipt.imageKey);
      return reply.code(201).send(
        toReceiptParsed({
          ...receipt,
          items: parsed.items,
          currency: "INR",
          imageUrl,
          confidence,
          warrantyHint: parsed.warrantyHint ?? null,
          claimContactHint: parsed.claimContactHint ?? null,
        }),
      );
    },
  );

  app.patch(
    "/receipts/:id",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["receipts"],
        params: z.object({ id: z.string().uuid() }),
        body: PatchReceiptBodySchema,
        response: {
          200: ReceiptParsedSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body;

      const existing = await app.deps.repos.getReceipt(id, userId);
      if (!existing) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Receipt not found" });
      }

      const nextOcrJson: Record<string, unknown> = {
        ...existing.ocrJson,
        ...(body.items ? { items: body.items } : {}),
        ...(body.gstin !== undefined ? { gstin: body.gstin } : {}),
      };

      const updated = await app.deps.repos.updateReceipt(id, userId, {
        merchant: body.merchant,
        purchasedAt: body.purchasedAt ? new Date(body.purchasedAt) : undefined,
        totalMinor: body.totalMinor,
        ocrJson: nextOcrJson,
      });
      if (!updated) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Receipt not found" });
      }

      audit(app.log, "receipt.corrected", { userId, receiptId: id });
      trackServerEvent("receipt_corrected", { userId, receiptId: id });

      const imageUrl = await app.deps.storage.getSignedUrl(updated.imageKey);
      const items = body.items ?? readItems(updated.ocrJson);
      return reply.code(200).send(
        toReceiptParsed({
          ...updated,
          items,
          currency: "INR",
          imageUrl,
          confidence: readConfidence(updated.ocrJson),
        }),
      );
    },
  );

  app.post(
    "/receipts/:id/confirm",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["receipts"],
        params: z.object({ id: z.string().uuid() }),
        body: ConfirmReceiptBodySchema,
        response: {
          200: ReceiptResponseSchema,
          404: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body;

      const existing = await app.deps.repos.getReceipt(id, userId);
      if (!existing) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Receipt not found" });
      }

      // Confirm happens once per receipt: a repeat or a double tap gets the purchase it made,
      // and nothing is written again.
      const sendConfirmed = async (purchaseId: string, currency: string) => {
        const current = (await app.deps.repos.getReceipt(id, userId)) ?? existing;
        const imageUrl = await app.deps.storage.getSignedUrl(current.imageKey);
        return reply.code(200).send(
          toReceiptResponse({ ...current, currency, purchaseId, imageUrl }),
        );
      };
      if (existing.purchaseId) {
        const linked = await app.deps.repos.findMerchantPurchaseById(existing.purchaseId);
        if (linked && linked.userId === userId) {
          return sendConfirmed(linked.id, linked.currency);
        }
      }

      // Persist manual corrections from the confirm body onto the receipt row.
      const correctedOcrJson: Record<string, unknown> = {
        ...existing.ocrJson,
        items: body.items,
        confidence: readConfidence(existing.ocrJson),
        manuallyCorrected: true,
        ...(body.overrideLowConfidence ? { overrideLowConfidence: true } : {}),
      };
      await app.deps.repos.updateReceipt(id, userId, {
        merchant: body.merchant,
        purchasedAt: new Date(body.purchasedAt),
        totalMinor: body.totalMinor,
        ocrJson: correctedOcrJson,
      });

      const purchasedAt = new Date(body.purchasedAt);
      const {
        computeExchangeWindowDeadline,
        computeReturnWindowDeadline,
        defaultEtaForStatus,
        findDuplicateWarnings,
      } = await import("@worn/shared");

      // Dup/rebuy warn on ingest (N11) — attach best match ids, never block
      const wardrobe = await app.deps.repos.listWardrobeItems(userId);
      const owned = wardrobe.map((w) => ({
        id: w.id,
        brand: w.brand,
        category: w.category,
        title: null as string | null,
      }));
      let dupWarnings = 0;
      const itemInputs = body.items.map((item) => {
        const warning = findDuplicateWarnings(
          [{ title: item.title, brand: null }],
          owned,
        )[0];
        if (warning) dupWarnings += 1;
        return {
          title: item.title,
          priceMinor: item.priceMinor,
          category: item.category ?? null,
          duplicateWardrobeItemId: warning?.matches[0]?.wardrobeItemId ?? null,
        };
      });

      // Explicit warranties from manual-correct UI
      const ocrClaimContact =
        typeof (existing.ocrJson as { claimContactHint?: unknown })
          .claimContactHint === "string"
          ? String(
              (existing.ocrJson as { claimContactHint: string }).claimContactHint,
            )
          : null;

      const warrantyInputs: CreateWarrantyInput[] = [];
      const autoDetected: Array<{ itemIndex: number; months: number; source?: "category_rules" }> = [];
      for (const w of body.warranties ?? []) {
        const item = body.items[w.itemIndex];
        if (!item) continue;
        const category =
          w.category ??
          inferWarrantyCategory(item.title, item.category) ??
          null;
        warrantyInputs.push({
          userId,
          receiptId: id,
          itemTitle: item.title,
          provider: body.merchant,
          coverageUntil: new Date(w.coverageUntil),
          claimContact:
            w.claimContact ??
            ocrClaimContact ??
            defaultClaimContactFromMerchant(body.merchant),
          category,
        });
      }

      // Auto-detect: if no explicit warranties but OCR hint suggests one, create it
      if ((!body.warranties || body.warranties.length === 0) && existing.ocrJson) {
        const raw = existing.ocrJson as {
          warrantyHint?: { itemIndex: number; months: number } | null;
          claimContactHint?: string | null;
        };
        const hint = raw.warrantyHint;
        if (hint && typeof hint.itemIndex === "number" && typeof hint.months === "number") {
          const idx = hint.itemIndex;
          const item = body.items[idx];
          if (item) {
            const category =
              inferWarrantyCategory(item.title, item.category) ?? "electronics";
            const coverageUntil = coverageUntilFromCategory(
              body.purchasedAt,
              category as WarrantyCategory,
              hint.months,
            );
            warrantyInputs.push({
              userId,
              receiptId: id,
              itemTitle: item.title,
              provider: body.merchant,
              coverageUntil,
              claimContact:
                raw.claimContactHint ??
                defaultClaimContactFromMerchant(body.merchant),
              category,
            });
            autoDetected.push({ itemIndex: idx, months: hint.months });
          }
        } else if (!body.warranties) {
          // U010 — category-rule drafts only when client omitted warranties entirely
          // (mobile pre-fills editable drafts; empty array means user opted out).
          const drafts = draftWarrantiesFromCategoryRules(
            body.items,
            body.purchasedAt,
          );
          for (const draft of drafts) {
            const item = body.items[draft.itemIndex];
            if (!item) continue;
            warrantyInputs.push({
              userId,
              receiptId: id,
              itemTitle: item.title,
              provider: body.merchant,
              coverageUntil: draft.coverageUntil,
              claimContact:
                raw.claimContactHint ??
                defaultClaimContactFromMerchant(body.merchant),
              category: draft.category,
            });
            autoDetected.push({ itemIndex: draft.itemIndex, months: draft.months, source: "category_rules" });
          }
        }
      }

      // Purchase, lines, warranties and the receipt link in one transaction (receipt locked).
      const confirmed = await app.deps.repos.confirmReceiptPurchase({
        receiptId: id,
        userId,
        purchase: {
          userId,
          source: "RECEIPT",
          merchant: body.merchant,
          purchasedAt,
          currency: body.currency,
          totalMinor: body.totalMinor,
          deliveryStatus: "ORDERED",
          etaAt: defaultEtaForStatus("ORDERED", purchasedAt),
          returnWindowDeadline: computeReturnWindowDeadline(purchasedAt, body.merchant),
          exchangeWindowDeadline: computeExchangeWindowDeadline(purchasedAt, body.merchant),
          items: itemInputs,
        },
        warranties: warrantyInputs,
      });
      if (!confirmed) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Receipt not found" });
      }
      const { purchase } = confirmed;
      if (!confirmed.created) {
        return sendConfirmed(purchase.id, purchase.currency);
      }

      await scheduleWarrantyReminders(confirmed.warranties);
      // N42: a new purchase may put a budget past 80%; the push runs off the response path.
      void sendSpendEnvelopeAlerts(app.deps.repos, userId).catch((err) =>
        app.log.warn({ err, userId }, "spend envelope alert failed"),
      );
      for (let i = 0; i < dupWarnings; i += 1) {
        trackServerEvent("dup_rebuy_warned", {
          userId,
          count: 1,
          source: "ingest",
        });
      }
      for (const detected of autoDetected) {
        trackServerEvent("warranty_auto_detected", {
          userId,
          receiptId: id,
          ...detected,
        });
      }

      audit(app.log, "receipt.confirmed", {
        userId,
        receiptId: id,
        purchaseId: purchase.id,
      });
      trackServerEvent("receipt_confirmed", {
        userId,
        receiptId: id,
        purchaseId: purchase.id,
      });
      for (const w of body.warranties ?? []) {
        trackServerEvent("warranty_created", {
          userId,
          receiptId: id,
          itemIndex: w.itemIndex,
        });
      }

      const imageUrl = await app.deps.storage.getSignedUrl(existing.imageKey);
      return reply.code(200).send(
        toReceiptResponse({
          ...existing,
          merchant: body.merchant,
          purchasedAt: new Date(body.purchasedAt),
          totalMinor: body.totalMinor,
          currency: body.currency,
          purchaseId: purchase.id,
          imageUrl,
          ocrJson: correctedOcrJson,
          confidence: readConfidence(correctedOcrJson),
        }),
      );
    },
  );

  app.get(
    "/receipts",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["receipts"],
        querystring: ReceiptSearchQuerySchema,
        response: {
          200: ReceiptListResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const query = request.query;
      const receipts = await app.deps.repos.listReceipts(userId);
      const filtered = filterReceiptsForSearch(receipts, query);
      if (query.merchant || query.from || query.to || query.gstin) {
        trackServerEvent("receipt_searched", {
          userId,
          count: filtered.length,
          hasMerchant: Boolean(query.merchant),
          hasGstin: Boolean(query.gstin),
          hasDate: Boolean(query.from || query.to),
        });
      }
      const signed = await Promise.all(
        filtered.map(async (r) => ({
          ...r,
          imageUrl: await app.deps.storage.getSignedUrl(r.imageKey),
        })),
      );
      return {
        receipts: signed.map((r) =>
          toReceiptResponse({
            ...r,
            currency: "INR",
            createdAt: r.createdAt,
            ocrJson: r.ocrJson,
          }),
        ),
      };
    },
  );

  app.get(
    "/receipts/:id/export",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["receipts"],
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          format: ReceiptExportFormatSchema.default("image"),
        }),
        response: {
          200: ReceiptExportResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const format = request.query.format ?? "image";
      const receipt = await app.deps.repos.getReceipt(id, userId);
      if (!receipt) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Receipt not found" });
      }

      const gstin = readReceiptGstin(receipt);
      const safeMerchant = receipt.merchant.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);

      if (format === "pdf") {
        const pdf = buildInvoicePdfBytes({
          merchant: receipt.merchant,
          purchasedAt: receipt.purchasedAt.toISOString().slice(0, 10),
          totalLabel: formatMinor(receipt.totalMinor, "INR"),
          gstin,
          receiptId: receipt.id,
        });
        const b64 = Buffer.from(pdf).toString("base64");
        const downloadUrl = `data:application/pdf;base64,${b64}`;
        audit(app.log, "receipt.exported", { userId, receiptId: id, format: "pdf" });
        trackServerEvent("receipt_exported", { userId, receiptId: id, format: "pdf" });
        return {
          id: receipt.id,
          format: "pdf" as const,
          filename: `${safeMerchant || "invoice"}-${receipt.id.slice(0, 8)}.pdf`,
          contentType: "application/pdf",
          downloadUrl,
          gstin,
          merchant: receipt.merchant,
        };
      }

      const downloadUrl = await app.deps.storage.getSignedUrl(receipt.imageKey);
      audit(app.log, "receipt.exported", { userId, receiptId: id, format: "image" });
      trackServerEvent("receipt_exported", { userId, receiptId: id, format: "image" });
      return {
        id: receipt.id,
        format: "image" as const,
        filename: `${safeMerchant || "receipt"}-${receipt.id.slice(0, 8)}.jpg`,
        contentType: "image/jpeg",
        downloadUrl,
        gstin,
        merchant: receipt.merchant,
      };
    },
  );

  app.get(
    "/warranties",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["warranties"],
        response: {
          200: WarrantyListResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const warranties = await app.deps.repos.listWarranties(userId);
      return { warranties: warranties.map(toWarrantyJson) };
    },
  );

  app.post(
    "/warranties/:id/claim",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["warranties"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: ClaimWarrantyResponseSchema,
          404: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const warranty = await app.deps.repos.claimWarranty(id, userId);
      if (!warranty) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Warranty not found" });
      }

      let orderRef: string | null = null;
      let receiptImageKey: string | null = null;
      if (warranty.receiptId) {
        const receipt = await app.deps.repos.getReceipt(
          warranty.receiptId,
          userId,
        );
        receiptImageKey = receipt?.imageKey ?? null;
        if (receipt?.purchaseId) {
          const purchase = await app.deps.repos.findMerchantPurchaseById(
            receipt.purchaseId,
          );
          orderRef = purchase?.orderRef ?? null;
        }
      }

      const claimContact =
        warranty.claimContact?.trim() ||
        defaultClaimContactFromMerchant(warranty.provider);
      const claimInput = {
        claimContact,
        itemTitle: warranty.itemTitle,
        provider: warranty.provider,
        orderRef,
        coverageUntil: warranty.coverageUntil,
        receiptId: warranty.receiptId,
        receiptImageKey,
      };
      const claimUrl = buildWarrantyClaimUrl(claimInput);
      const packet = buildWarrantyClaimPacket(claimInput);
      const claimedAt = warranty.updatedAt.toISOString();

      audit(app.log, "warranty.claimed", {
        userId,
        warrantyId: id,
        claimUrl: claimUrl ?? null,
        orderRef,
        attachmentCount: packet.attachmentKeys.length,
      });
      trackServerEvent("warranty_claimed", {
        userId,
        warrantyId: id,
        hasClaimUrl: Boolean(claimUrl),
        attachmentCount: packet.attachmentKeys.length,
      });
      return reply.code(200).send({
        ...toWarrantyJson(warranty),
        claimUrl,
        orderRef,
        packet,
        claimedAt,
        canUnclaim: canUnclaimWarranty(claimedAt),
      });
    },
  );

  app.post(
    "/warranties/:id/unclaim",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["warranties"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: WarrantySchema,
          400: ErrorSchema,
          404: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findWarranty(id, userId);
      if (!existing) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Warranty not found" });
      }
      if (existing.state === "CLAIMED" && !canUnclaimWarranty(existing.updatedAt)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: warrantyUnclaimExpiredCopy(),
        });
      }
      const warranty = await app.deps.repos.unclaimWarranty(id, userId);
      if (!warranty) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Warranty not found" });
      }
      audit(app.log, "warranty.unclaimed", {
        userId,
        warrantyId: id,
      });
      return reply.code(200).send(toWarrantyJson(warranty));
    },
  );

  app.post(
    "/warranties/:id/snooze",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["warranties"],
        params: z.object({ id: z.string().uuid() }),
        body: SnoozeWarrantyBodySchema,
        response: {
          200: SnoozeWarrantyResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const warranty = await app.deps.repos.findWarranty(id, userId);
      if (!warranty) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Warranty not found" });
      }

      const nowMs = Date.now();
      const snoozedUntil = request.body.until
        ? new Date(request.body.until)
        : new Date(
            nowMs +
              (request.body.days
                ? request.body.days * 86_400_000
                : WARRANTY_SNOOZE_DEFAULT_MS),
          );

      if (snoozedUntil.getTime() <= nowMs) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Snooze until must be in the future",
        });
      }

      const status = await snoozeWarrantyReminder(warranty, snoozedUntil);
      audit(app.log, "warranty.snoozed", {
        userId,
        warrantyId: id,
        snoozedUntil: snoozedUntil.toISOString(),
        status,
      });
      return reply.code(200).send({
        warrantyId: id,
        snoozedUntil: snoozedUntil.toISOString(),
        status,
      });
    },
  );
};
