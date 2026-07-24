import {
  CashbackHistoryResponseSchema,
  CashbackWebhookBodySchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const CashbackClickBodySchema = z.object({
  listingId: z.string().uuid(),
  platform: z.string(),
  clickId: z.string(),
});

export const cashbackRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/cashback/click",
    {
      schema: {
        tags: ["cashback"],
        body: CashbackClickBodySchema,
        response: { 200: z.object({ recorded: z.literal(true) }), 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      await app.deps.repos.recordCashbackEvent({
        userId: request.user.sub,
        listingId: request.body.listingId,
        platform: request.body.platform,
        clickId: request.body.clickId,
      });
      return { recorded: true as const };
    },
  );

  app.get(
    "/cashback/me",
    {
      schema: {
        tags: ["cashback"],
        response: { 200: CashbackHistoryResponseSchema, 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const events = await app.deps.repos.listCashbackEvents(request.user.sub);
      const totalEarned = events
        .filter((e) => e.status === "CONFIRMED")
        .reduce((sum, e) => sum + e.coinsEarned, 0);
      return {
        events: events.map((e) => ({
          id: e.id,
          listingId: e.listingId,
          platform: e.platform,
          coinsEarned: e.coinsEarned,
          status: e.status as "PENDING" | "CONFIRMED" | "REJECTED",
          createdAt: e.createdAt.toISOString(),
        })),
        totalEarned,
      };
    },
  );

  app.post(
    "/cashback/webhook",
    {
      schema: {
        tags: ["cashback"],
        body: CashbackWebhookBodySchema,
        response: { 200: z.object({ ok: z.literal(true) }), 400: ErrorSchema, 401: ErrorSchema, 503: ErrorSchema },
      },
    },
    async (request, reply) => {
      const secret = process.env.CASHBACK_WEBHOOK_SECRET;
      const isTest = process.env.NODE_ENV === "test";

      if (!isTest) {
        if (!secret) {
          return reply.code(503).send({
            error: "Service Unavailable",
            message: "Cashback webhook is not configured",
          });
        }
        if (request.headers["x-webhook-secret"] !== secret) {
          return reply.code(401).send({ error: "Unauthorized", message: "Invalid webhook secret" });
        }
      } else if (secret && request.headers["x-webhook-secret"] !== secret) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid webhook secret" });
      }

      await app.deps.repos.confirmCashback(
        request.body.clickId,
        request.body.status,
      );
      return { ok: true as const };
    },
  );
};
