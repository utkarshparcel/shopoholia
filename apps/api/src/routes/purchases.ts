import {
  MergePurchasesBodySchema,
  MergePurchasesResponseSchema,
  MerchantPurchaseItemSchema,
  MerchantPurchaseSchema,
  PurchasesDetailListResponseSchema,
  SplitPurchaseBodySchema,
  SplitPurchaseResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { audit } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import {
  PurchaseMergeSplitError,
  mergePurchases,
  splitPurchase,
} from "../lib/purchase-merge-split.js";
import type {
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
} from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toPurchaseJson(p: MerchantPurchaseRecord) {
  return {
    id: p.id,
    source: p.source,
    merchant: p.merchant,
    orderRef: p.orderRef,
    purchasedAt: p.purchasedAt.toISOString(),
    currency: p.currency,
    totalMinor: p.totalMinor,
    status: p.status,
    rawDocId: p.rawDocId,
    deliveryStatus: p.deliveryStatus,
    etaAt: p.etaAt ? p.etaAt.toISOString() : null,
    trackingCode: p.trackingCode ?? null,
    deliveredAt: p.deliveredAt ? p.deliveredAt.toISOString() : null,
    returnWindowDeadline: p.returnWindowDeadline
      ? p.returnWindowDeadline.toISOString()
      : null,
    exchangeWindowDeadline: p.exchangeWindowDeadline
      ? p.exchangeWindowDeadline.toISOString()
      : null,
  };
}

function toPurchaseItemJson(it: MerchantPurchaseItemRecord) {
  return {
    id: it.id,
    purchaseId: it.purchaseId,
    title: it.title,
    category: it.category,
    brand: it.brand ?? null,
    priceMinor: it.priceMinor,
    imageKey: it.imageKey,
    qty: it.qty,
    duplicateWardrobeItemId: it.duplicateWardrobeItemId ?? null,
  };
}

function errorStatus(code: PurchaseMergeSplitError["code"]): 400 | 404 | 409 {
  if (code === "NOT_FOUND") return 404;
  if (code === "CONFLICT") return 409;
  return 400;
}

/**
 * N48 — purchase merge / split for ingest trust (double parses & multi-item orders).
 */
export const purchasesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/purchases",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["purchases"],
        response: {
          200: PurchasesDetailListResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const purchases = (await app.deps.repos.listMerchantPurchases(userId)).filter(
        (p) => p.status !== "DUPLICATE",
      );
      const itemsByPurchase =
        await app.deps.repos.listMerchantPurchaseItemsByPurchaseIds(
          purchases.map((p) => p.id),
        );
      return {
        purchases: purchases.map((p) => ({
          purchase: MerchantPurchaseSchema.parse(toPurchaseJson(p)),
          items: (itemsByPurchase.get(p.id) ?? []).map((i) =>
            MerchantPurchaseItemSchema.parse(toPurchaseItemJson(i)),
          ),
        })),
      };
    },
  );

  app.post(
    "/purchases/merge",
    {
      preHandler: requireAuth,
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 30,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["purchases"],
        body: MergePurchasesBodySchema,
        response: {
          200: MergePurchasesResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      try {
        const result = await mergePurchases(app.deps.repos, userId, request.body);
        audit(app.log, "purchases.merged", {
          userId,
          targetPurchaseId: result.purchase.id,
          sourcePurchaseId: result.mergedFromId,
          itemCount: result.items.length,
          totalMinor: result.purchase.totalMinor,
        });
        trackServerEvent("purchases_merged", {
          userId,
          targetPurchaseId: result.purchase.id,
          sourcePurchaseId: result.mergedFromId,
          itemCount: result.items.length,
        });
        return {
          purchase: MerchantPurchaseSchema.parse(toPurchaseJson(result.purchase)),
          items: result.items.map((i) =>
            MerchantPurchaseItemSchema.parse(toPurchaseItemJson(i)),
          ),
          mergedFromId: result.mergedFromId,
        };
      } catch (error) {
        if (error instanceof PurchaseMergeSplitError) {
          return reply
            .code(errorStatus(error.code))
            .send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/purchases/split",
    {
      preHandler: requireAuth,
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 30,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["purchases"],
        body: SplitPurchaseBodySchema,
        response: {
          200: SplitPurchaseResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      try {
        const result = await splitPurchase(app.deps.repos, userId, request.body);
        audit(app.log, "purchases.split", {
          userId,
          originalPurchaseId: result.original.purchase.id,
          splitPurchaseId: result.split.purchase.id,
          movedItemCount: result.split.items.length,
        });
        trackServerEvent("purchases_split", {
          userId,
          originalPurchaseId: result.original.purchase.id,
          splitPurchaseId: result.split.purchase.id,
          movedItemCount: result.split.items.length,
        });
        return {
          original: {
            purchase: MerchantPurchaseSchema.parse(
              toPurchaseJson(result.original.purchase),
            ),
            items: result.original.items.map((i) =>
              MerchantPurchaseItemSchema.parse(toPurchaseItemJson(i)),
            ),
          },
          split: {
            purchase: MerchantPurchaseSchema.parse(
              toPurchaseJson(result.split.purchase),
            ),
            items: result.split.items.map((i) =>
              MerchantPurchaseItemSchema.parse(toPurchaseItemJson(i)),
            ),
          },
        };
      } catch (error) {
        if (error instanceof PurchaseMergeSplitError) {
          return reply
            .code(errorStatus(error.code))
            .send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );
};
