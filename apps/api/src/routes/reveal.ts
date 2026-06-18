import {
  RevealRatingBodySchema,
  RevealRatingResponseSchema,
  RevealResponseSchema,
  UnlockBodySchema,
  UnlockResponseSchema,
  REVEAL_UNLOCK_COST_COINS,
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
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const order = await app.deps.repos.findOrderById(request.params.id);
      if (!order || order.userId !== request.user.sub) {
        return reply.code(404).send({ error: "Not Found", message: "Order not found" });
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
        refType: "order",
        refId: order.id,
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

      // Week 6 stub — persist to analytics warehouse in production.
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
