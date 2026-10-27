import {
  PrebuyFitBodySchema,
  PrebuyFitResponseSchema,
  TrackPlayBuyFromOrderBodySchema,
  TrackPlayBuyResponseSchema,
  MerchantPurchaseSchema,
  MerchantPurchaseItemSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { audit } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import { evaluateCartPrebuyFit } from "../lib/prebuy-service.js";
import { candidatesFromListingIds, type PrebuyCandidate } from "../lib/prebuy-fit.js";
import { TrackPlayBuyError, trackPlayBuyInCloset } from "../lib/track-play-buy.js";
import { budgetSoftGate } from "../lib/budget-soft-gate.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toPurchaseJson(p: {
  id: string;
  source: string;
  merchant: string;
  orderRef: string | null;
  purchasedAt: Date;
  currency: string;
  totalMinor: number;
  status: string;
  rawDocId: string | null;
  deliveryStatus?: string;
  etaAt?: Date | null;
  trackingCode?: string | null;
  deliveredAt?: Date | null;
  returnWindowDeadline?: Date | null;
  exchangeWindowDeadline?: Date | null;
}) {
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

function toPurchaseItemJson(it: {
  id: string;
  purchaseId: string;
  title: string;
  category: string | null;
  brand?: string | null;
  priceMinor: number;
  imageKey: string | null;
  qty: number;
  duplicateWardrobeItemId?: string | null;
}) {
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

/**
 * Sanctioned Play ↔ Closet bridges:
 * - N50 POST /purchases/from-order — alias of track-in-closet
 * - N33 POST /prebuy/fit — “Check my closet” overlap/gap/budget score
 */
export const bridgeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/purchases/from-order",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["bridge"],
        body: TrackPlayBuyFromOrderBodySchema,
        response: {
          200: TrackPlayBuyResponseSchema,
          201: TrackPlayBuyResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { orderId, seedWardrobe } = request.body;
      try {
        const result = await trackPlayBuyInCloset(app.deps.repos, {
          userId,
          orderId,
          seedWardrobe: seedWardrobe ?? false,
        });
        const purchase = await app.deps.repos.findMerchantPurchaseById(result.purchaseId);
        if (!purchase) {
          return reply.code(404).send({ error: "Not Found", message: "Purchase not found" });
        }
        const items = await app.deps.repos.listMerchantPurchaseItems(purchase.id);
        audit(app.log, "bridge.play_buy_tracked", {
          userId,
          orderId,
          purchaseId: purchase.id,
          created: result.created,
        });
        trackServerEvent("play_buy_tracked", {
          userId,
          orderId,
          purchaseId: purchase.id,
          created: result.created,
          wardrobeCount: result.wardrobeItemIds.length,
        });
        const payload = {
          purchase: MerchantPurchaseSchema.parse(toPurchaseJson(purchase)),
          items: items.map((i) => MerchantPurchaseItemSchema.parse(toPurchaseItemJson(i))),
          wardrobeItemIds: result.wardrobeItemIds,
          created: result.created,
          purchaseId: purchase.id,
          itemCount: items.length,
        };
        return reply.code(result.created ? 201 : 200).send(payload);
      } catch (error) {
        if (error instanceof TrackPlayBuyError) {
          const status = error.code === "NOT_FOUND" ? 404 : 400;
          return reply.code(status).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/prebuy/fit",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["bridge"],
        body: PrebuyFitBodySchema,
        response: {
          200: PrebuyFitResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const body = request.body;

      let overrides: PrebuyCandidate[] | undefined;
      const direct = body.candidates ?? body.items;
      if (direct && direct.length > 0) {
        overrides = direct.map((c) => ({
          title: c.title,
          category: c.category ?? null,
          brand: c.brand ?? null,
          priceMinor: c.priceMinor,
          qty: c.qty ?? 1,
          listingId: c.listingId ?? null,
        }));
      } else if (body.listingIds && body.listingIds.length > 0) {
        overrides = await candidatesFromListingIds(app.deps.repos, body.listingIds);
        if (overrides.length === 0) {
          return reply
            .code(400)
            .send({ error: "NOT_FOUND", message: "No listings found for closet fit check" });
        }
      } else if (body.useCart) {
        const cart = await app.deps.repos.getOrCreateCart(userId);
        const rows = await app.deps.repos.getCartItems(cart.id);
        if (rows.length === 0) {
          return reply
            .code(400)
            .send({ error: "EMPTY_CART", message: "Add items to your haul before checking closet fit" });
        }
      }

      const { fit, primaryBudgetNudge } = await evaluateCartPrebuyFit(
        app.deps.repos,
        userId,
        overrides,
      );

      const gate = budgetSoftGate({
        exceeded: Boolean(primaryBudgetNudge?.exceeded || fit.softBlock),
        category: primaryBudgetNudge?.category,
        message: primaryBudgetNudge?.message,
      });

      trackServerEvent("prebuy_fit_checked", {
        userId,
        score: fit.score,
        overlapCount: fit.overlaps.length,
        gapCount: fit.gaps.length,
        softBlock: Boolean(gate?.softBlock || fit.softBlock),
      });

      return {
        ...fit,
        softBlock: Boolean(gate?.softBlock || fit.softBlock),
        primaryBudgetNudge,
        budgetSoftGate: gate,
      };
    },
  );
};
