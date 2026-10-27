import {
  CreateOrderBodySchema,
  MerchantPurchaseItemSchema,
  MerchantPurchaseSchema,
  OrderListResponseSchema,
  OrderParamsSchema,
  OrderSummarySchema,
  RushOrderResponseSchema,
  TrackPlayBuyBodySchema,
  TrackPlayBuyResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { CheckoutError, checkoutOrder } from "../lib/orders/checkout.js";
import { orderSummaryDto } from "../lib/orders/dto.js";
import { RushError, rushOrderToExpress } from "../lib/orders/rush.js";
import { TrackPlayBuyError, trackPlayBuyInCloset } from "../lib/track-play-buy.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });
const CoolingOffErrorSchema = ErrorSchema.extend({
  coolingOff: z
    .object({
      heldAt: z.string(),
      releaseAt: z.string(),
      category: z.string(),
      projectedMinor: z.number(),
      limitMinor: z.number(),
      cartFingerprint: z.string(),
    })
    .nullable(),
});

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

function rushErrorStatus(code: RushError["code"]) {
  if (code === "NOT_FOUND") return 404;
  if (code === "INSUFFICIENT_COINS") return 402;
  return 409;
}

export const ordersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/orders",
    {
      schema: {
        tags: ["orders"],
        body: CreateOrderBodySchema,
        response: {
          201: OrderSummarySchema,
          400: ErrorSchema,
          401: ErrorSchema,
          402: ErrorSchema,
          423: CoolingOffErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      try {
        const { order, budgetNudge, duplicateWarnings } = await checkoutOrder(app.deps, {
          userId: request.user.sub,
          tier: request.body.tier,
          idempotencyKey: request.body.idempotencyKey,
          coolingOffOverride: request.body.coolingOffOverride,
        });
        return reply
          .code(201)
          .send(orderSummaryDto(order, { budgetNudge, duplicateWarnings }));
      } catch (error) {
        if (error instanceof CheckoutError) {
          if (error.code === "COOLING_OFF") {
            return reply.code(423).send({
              error: error.code,
              message: error.message,
              coolingOff: error.coolingOff,
            });
          }
          const status = error.code === "INSUFFICIENT_COINS" ? 402 : 400;
          return reply.code(status).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/orders",
    {
      schema: {
        tags: ["orders"],
        response: {
          200: OrderListResponseSchema,
          401: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const orders = await app.deps.repos.listOrdersByUserId(request.user.sub);
      return { orders: orders.map((o) => orderSummaryDto(o)) };
    },
  );

  app.get(
    "/orders/:id",
    {
      schema: {
        tags: ["orders"],
        params: OrderParamsSchema,
        response: {
          200: OrderSummarySchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const order = await app.deps.repos.findOrderById(request.params.id);
      if (!order || order.userId !== request.user.sub) {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
      }
      const tracked = await app.deps.repos.findMerchantPurchaseByOrderRef(
        request.user.sub,
        order.id,
      );
      return orderSummaryDto(order, { trackedInCloset: Boolean(tracked) });
    },
  );

  // N50: Track this Play buy in Closet (seed merchant_purchases)
  app.post(
    "/orders/:id/track-in-closet",
    {
      schema: {
        tags: ["orders", "closet"],
        params: OrderParamsSchema,
        body: TrackPlayBuyBodySchema,
        response: {
          200: TrackPlayBuyResponseSchema,
          201: TrackPlayBuyResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const userId = request.user.sub;
      try {
        const result = await trackPlayBuyInCloset(app.deps.repos, {
          userId,
          orderId: request.params.id,
          seedWardrobe: request.body.seedWardrobe ?? true,
        });
        const purchase = await app.deps.repos.findMerchantPurchaseById(result.purchaseId);
        if (!purchase) {
          return reply.code(404).send({ error: "Not Found", message: "Purchase not found" });
        }
        const items = await app.deps.repos.listMerchantPurchaseItems(purchase.id);
        audit(app.log, "play.buy.tracked", {
          userId,
          orderId: request.params.id,
          purchaseId: purchase.id,
          created: result.created,
        });
        trackServerEvent("play_buy_tracked", {
          userId,
          orderId: request.params.id,
          purchaseId: purchase.id,
          created: result.created,
          wardrobeCount: result.wardrobeItemIds.length,
        });
        const parsed = {
          purchase: MerchantPurchaseSchema.parse(toPurchaseJson(purchase)),
          items: items.map((i) => MerchantPurchaseItemSchema.parse(toPurchaseItemJson(i))),
          wardrobeItemIds: result.wardrobeItemIds,
          created: result.created,
          purchaseId: purchase.id,
          itemCount: items.length,
        };
        return reply.code(result.created ? 201 : 200).send(parsed);
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
    "/orders/:id/rush",
    {
      schema: {
        tags: ["orders"],
        params: OrderParamsSchema,
        response: {
          200: RushOrderResponseSchema,
          401: ErrorSchema,
          402: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      try {
        const { order, balanceAfter } = await rushOrderToExpress(app.deps, {
          userId: request.user.sub,
          orderId: request.params.id,
        });
        const tracked = await app.deps.repos.findMerchantPurchaseByOrderRef(
          request.user.sub,
          order.id,
        );
        return {
          order: orderSummaryDto(order, { trackedInCloset: Boolean(tracked) }),
          balanceAfter,
        };
      } catch (error) {
        if (error instanceof RushError) {
          return reply
            .code(rushErrorStatus(error.code))
            .send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );
};
