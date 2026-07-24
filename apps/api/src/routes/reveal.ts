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
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { renderCardDto } from "../lib/render/dto.js";
import { processRenderJob } from "../lib/render/pipeline.js";

const OrderParamsSchema = z.object({
  id: z.string().uuid(),
});

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const REVEAL_OPEN_STATES = new Set(["DELIVERED", "REVEAL_READY"]);

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

      if (request.body.idempotencyKey) {
        const existingSpend = await app.deps.repos.findCoinSpendByRef(
          request.user.sub,
          "reveal_unlock",
          request.body.idempotencyKey,
        );
        if (existingSpend) {
          const refreshed = await app.deps.repos.findRendersByIds(request.body.renderIds);
          const cards = await Promise.all(
            refreshed.map((render) => renderCardDto(render, app.deps.storage)),
          );
          return { renders: cards, coinsSpent: Math.abs(existingSpend.delta) };
        }
      }

      const renders = await app.deps.repos.findRendersByIds(request.body.renderIds);
      const orderRenders = await app.deps.repos.findRendersByOrderId(order.id);
      const orderRenderIds = new Set(orderRenders.map((r) => r.id));

      const toUnlock = renders.filter(
        (r) => orderRenderIds.has(r.id) && !r.isFree && !r.unlocked,
      );
      if (toUnlock.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "No locked renders found" });
      }

      const coinsSpent = toUnlock.length * REVEAL_UNLOCK_COST_COINS;
      const balance = await app.deps.repos.getCoinBalance(request.user.sub);
      if (balance < coinsSpent) {
        return reply.code(402).send({
          error: "INSUFFICIENT_COINS",
          message: "Not enough coins to unlock these renders",
        });
      }

      await app.deps.repos.spendCoins({
        userId: request.user.sub,
        delta: coinsSpent,
        type: "SPEND_UNLOCK",
        refType: request.body.idempotencyKey ? "reveal_unlock" : "order",
        refId: request.body.idempotencyKey ?? order.id,
      });

      const unlocked: typeof renders = [];
      for (const render of toUnlock) {
        const updated = await app.deps.repos.updateRender(render.id, { unlocked: true });
        if (updated) unlocked.push(updated);
      }

      for (const render of unlocked) {
        if (render.status === "QUEUED") {
          await app.deps.jobQueue.enqueueRender({ renderId: render.id, orderId: order.id });
        }
      }

      if (app.deps.jobQueue.flushRenderJobs) {
        await app.deps.jobQueue.flushRenderJobs();
      } else {
        for (const render of unlocked) {
          if (render.status === "QUEUED") {
            await processRenderJob(
              {
                repos: app.deps.repos,
                storage: app.deps.storage,
                renderProvider: app.deps.renderProvider,
                push: app.deps.push,
              },
              render.id,
              order.id,
            );
          }
        }
      }

      const refreshed = await app.deps.repos.findRendersByIds(unlocked.map((r) => r.id));
      const cards = await Promise.all(
        refreshed.map((render) => renderCardDto(render, app.deps.storage)),
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

      const isCombine = request.body.orderItemIds.length > 1;
      const coinsPerRender = isCombine ? REVEAL_COMBINE_COST_COINS : REVEAL_GENERATE_COST_COINS;
      const totalCost = coinsPerRender;

      const balance = await app.deps.repos.getCoinBalance(request.user.sub);
      if (balance < totalCost) {
        return reply.code(402).send({
          error: "INSUFFICIENT_COINS",
          message: `Need ${totalCost} coins for this render. You have ${balance}.`,
        });
      }

      const items = await app.deps.repos.listOrderItemsByOrderId(order.id);
      const validItemIds = new Set(items.map((i) => i.id));
      const invalidItemIds = request.body.orderItemIds.filter((id) => !validItemIds.has(id));
      if (invalidItemIds.length > 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `Invalid order items: ${invalidItemIds.join(", ")}`,
        });
      }

      await app.deps.repos.spendCoins({
        userId: request.user.sub,
        delta: totalCost,
        type: "SPEND_UNLOCK",
        refType: "order",
        refId: order.id,
      });

      const creates = request.body.orderItemIds.map((orderItemId) => ({
        orderItemId,
        scenario: request.body.scenario,
        imageKey: null,
        isFree: false,
        unlocked: true,
        provider: isCombine
          ? `combined:${request.body.orderItemIds.join(",")}`
          : "user-generated",
        status: "QUEUED" as const,
        costMicros: 0,
      }));

      const newRenders = await app.deps.repos.createRenders(creates);

      for (const render of newRenders) {
        if (app.deps.jobQueue.enqueueRender) {
          await app.deps.jobQueue.enqueueRender({ renderId: render.id, orderId: order.id });
        }
      }

      if (app.deps.jobQueue.flushRenderJobs) {
        await app.deps.jobQueue.flushRenderJobs();
      } else {
        for (const render of newRenders) {
          await processRenderJob(
            { repos: app.deps.repos, storage: app.deps.storage, renderProvider: app.deps.renderProvider, push: app.deps.push },
            render.id,
            order.id,
          );
        }
      }

      const refreshed = await app.deps.repos.findRendersByIds(newRenders.map((r) => r.id));
      const cards = await Promise.all(
        refreshed.map((render) => renderCardDto(render, app.deps.storage)),
      );

      return { renders: cards, coinsSpent: totalCost, isCombine };
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
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const order = await app.deps.repos.findOrderById(request.params.id);
      if (!order || order.userId !== request.user.sub) {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
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
