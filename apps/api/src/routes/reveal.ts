import {
  GenerateRenderBodySchema,
  GenerateRenderResponseSchema,
  RevealRatingBodySchema,
  RevealRatingResponseSchema,
  RevealResponseSchema,
  UnlockBodySchema,
  UnlockResponseSchema,
  REVEAL_UNLOCK_COST_COINS,
  REVEAL_GENERATE_COST_COINS,
  REVEAL_COMBINE_COST_COINS,
  RetryRendersBodySchema,
  RetryRendersResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { renderCardDto } from "../lib/render/dto.js";
import { USER_GENERATED_PROVIDER } from "../lib/render/pipeline.js";
import { renderProviderAvailable } from "../lib/render/provider.js";

const OrderParamsSchema = z.object({
  id: z.string().uuid(),
});

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const REVEAL_OPEN_STATES = new Set(["DELIVERED", "REVEAL_READY"]);

/** Before any coins move: a render that can't run must not be paid for. */
const RENDER_UNAVAILABLE = {
  error: "tryon_unavailable",
  message: "Renders are not available right now. You have not been charged.",
};

export const revealRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/orders/:id/reveal",
    {
      schema: {
        tags: ["reveal"],
        params: OrderParamsSchema,
        response: {
          200: RevealResponseSchema,
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

      const renders = await app.deps.repos.findRendersByOrderId(order.id);
      const cards = await Promise.all(
        renders.map((render) => renderCardDto(render, app.deps.storage)),
      );

      return { orderId: order.id, renders: cards };
    },
  );

  app.post(
    "/orders/:id/reveal/unlock",
    {
      schema: {
        tags: ["reveal"],
        params: OrderParamsSchema,
        body: UnlockBodySchema,
        response: {
          200: UnlockResponseSchema,
          401: ErrorSchema,
          402: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          503: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const order = await app.deps.repos.findOrderById(request.params.id);
      if (!order || order.userId !== request.user.sub) {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
      }
      if (!REVEAL_OPEN_STATES.has(order.state)) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Reveal is not available until your order is delivered",
        });
      }
      if (!renderProviderAvailable(app.deps.renderProvider)) {
        return reply.code(503).send(RENDER_UNAVAILABLE);
      }

      const result = await app.deps.repos.unlockOrderRenders({
        userId: request.user.sub,
        orderId: order.id,
        renderIds: request.body.renderIds,
        costPerRender: REVEAL_UNLOCK_COST_COINS,
        idempotencyKey: request.body.idempotencyKey,
      });

      if (result.status === "replayed") {
        // Only this order's renders: the ids in a replayed body are not trusted.
        const orderRenders = await app.deps.repos.findRendersByOrderId(order.id);
        const requested = new Set(request.body.renderIds);
        const cards = await Promise.all(
          orderRenders
            .filter((render) => requested.has(render.id))
            .map((render) => renderCardDto(render, app.deps.storage)),
        );
        return { renders: cards, coinsSpent: result.coinsSpent };
      }
      if (result.status === "nothing_locked") {
        return reply.code(404).send({ error: "Not Found", message: "No locked renders found" });
      }
      if (result.status === "insufficient_coins") {
        return reply.code(402).send({
          error: "INSUFFICIENT_COINS",
          message: "Not enough coins to unlock these renders",
        });
      }

      const { renders: unlocked, coinsSpent } = result;

      // Rendering takes minutes: the job runs in the background, and the app polls the reveal
      // while the cards come back QUEUED. A render that fails is refunded.
      for (const render of unlocked) {
        if (render.status === "QUEUED") {
          await app.deps.jobQueue.enqueueRender({ renderId: render.id, orderId: order.id });
        }
      }

      const cards = await Promise.all(
        unlocked.map((render) => renderCardDto(render, app.deps.storage)),
      );

      return { renders: cards, coinsSpent };
    },
  );

  app.post(
    "/orders/:id/reveal/generate",
    {
      schema: {
        tags: ["reveal"],
        params: OrderParamsSchema,
        body: GenerateRenderBodySchema,
        response: {
          200: GenerateRenderResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          402: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          503: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const order = await app.deps.repos.findOrderById(request.params.id);
      if (!order || order.userId !== request.user.sub) {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
      }
      if (!REVEAL_OPEN_STATES.has(order.state)) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Reveal is not available until your order is delivered",
        });
      }
      if (!renderProviderAvailable(app.deps.renderProvider)) {
        return reply.code(503).send(RENDER_UNAVAILABLE);
      }

      const orderItemIds = [...new Set(request.body.orderItemIds)];
      const items = await app.deps.repos.listOrderItemsByOrderId(order.id);
      const validItemIds = new Set(items.map((i) => i.id));
      const invalidItemIds = orderItemIds.filter((id) => !validItemIds.has(id));
      if (invalidItemIds.length > 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `Invalid order items: ${invalidItemIds.join(", ")}`,
        });
      }

      // One render either way: a single item's, or one combined render of all of them.
      const isCombine = orderItemIds.length > 1;
      const totalCost = isCombine ? REVEAL_COMBINE_COST_COINS : REVEAL_GENERATE_COST_COINS;

      // The debit and the render are one step, so a retried or double-tapped request with the
      // same key gets the first one's render back and is not charged again.
      const result = await app.deps.repos.purchaseRender({
        userId: request.user.sub,
        orderId: order.id,
        render: {
          orderItemId: orderItemIds[0]!,
          scenario: request.body.scenario,
          imageKey: null,
          isFree: false,
          unlocked: true,
          provider: USER_GENERATED_PROVIDER,
          combinedItemIds: isCombine ? orderItemIds : null,
          status: "QUEUED",
          costMicros: 0,
        },
        cost: totalCost,
        ledgerType: isCombine ? "SPEND_COMBINE" : "SPEND_RENDER",
        idempotencyKey: request.body.idempotencyKey,
      });

      if (result.status === "not_found") {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
      }
      if (result.status === "insufficient_coins") {
        return reply.code(402).send({
          error: "INSUFFICIENT_COINS",
          message: `Need ${totalCost} coins for this render. You have ${result.balance}.`,
        });
      }
      if (result.status === "replayed") {
        // The first call's render, whatever this body asked for; it was queued by that call.
        const cards = result.render ? [await renderCardDto(result.render, app.deps.storage)] : [];
        return {
          renders: cards,
          coinsSpent: result.coinsSpent,
          isCombine: result.ledgerType === "SPEND_COMBINE",
        };
      }

      // Queued, not rendered here: the app polls the reveal until the card is DONE or FAILED
      // (and refunded).
      await app.deps.jobQueue.enqueueRender({ renderId: result.render.id, orderId: order.id });

      return {
        renders: [await renderCardDto(result.render, app.deps.storage)],
        coinsSpent: totalCost,
        isCombine,
      };
    },
  );

  app.post(
    "/orders/:id/reveal/retry",
    {
      schema: {
        tags: ["reveal"],
        params: OrderParamsSchema,
        body: RetryRendersBodySchema,
        response: {
          200: RetryRendersResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          503: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const order = await app.deps.repos.findOrderById(request.params.id);
      if (!order || order.userId !== request.user.sub) {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
      }
      if (!REVEAL_OPEN_STATES.has(order.state)) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Reveal is not available until your order is delivered",
        });
      }
      if (!renderProviderAvailable(app.deps.renderProvider)) {
        return reply.code(503).send(RENDER_UNAVAILABLE);
      }

      // Free looks only: a paid render that failed was refunded, and is bought again instead.
      const queued = await app.deps.repos.requeueFailedFreeRenders({
        userId: request.user.sub,
        orderId: order.id,
        renderIds: request.body.renderIds,
      });
      if (queued.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "No failed renders to retry" });
      }
      for (const render of queued) {
        await app.deps.jobQueue.enqueueRender({ renderId: render.id, orderId: order.id });
      }

      const cards = await Promise.all(queued.map((render) => renderCardDto(render, app.deps.storage)));
      return { renders: cards };
    },
  );

  app.post(
    "/orders/:id/reveal/rating",
    {
      schema: {
        tags: ["reveal"],
        params: OrderParamsSchema,
        body: RevealRatingBodySchema,
        response: {
          200: RevealRatingResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const order = await app.deps.repos.findOrderById(request.params.id);
      if (!order || order.userId !== request.user.sub) {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
      }
      if (!REVEAL_OPEN_STATES.has(order.state)) {
        return reply.code(409).send({
          error: "Conflict",
          message: "You can rate the reveal once your order is delivered",
        });
      }

      await app.deps.repos.recordRevealRating({
        orderId: order.id,
        userId: request.user.sub,
        rating: request.body.rating,
      });

      request.log.info(
        { orderId: order.id, rating: request.body.rating, userId: request.user.sub },
        "reveal_rating_recorded",
      );

      return {
        orderId: order.id,
        rating: request.body.rating,
        recorded: true as const,
      };
    },
  );
};
