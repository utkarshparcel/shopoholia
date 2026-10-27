import {
  CashbackClickBodySchema,
  CashbackClickResponseSchema,
  CashbackHistoryResponseSchema,
  CashbackWebhookBodySchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import {
  buildClosetAffiliateClickId,
  isClosetAffiliateSource,
  platformFromAffiliateUrl,
  type ClosetAffiliateSource,
} from "../lib/closet-affiliate.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const cashbackRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/cashback/click",
    {
      schema: {
        tags: ["cashback"],
        body: CashbackClickBodySchema,
        response: {
          200: CashbackClickResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const body = request.body as {
        listingId?: string | null;
        platform: string;
        clickId?: string;
        source?: string;
        url?: string;
      };
      const source = body.source ?? "play_listing";
      const listingId = body.listingId ?? null;
      let platform = body.platform?.trim() || "other";
      if (body.url && (platform === "other" || !platform)) {
        platform = platformFromAffiliateUrl(body.url);
      }

      let clickId = body.clickId;
      if (!clickId) {
        if (isClosetAffiliateSource(source)) {
          clickId = buildClosetAffiliateClickId(source as ClosetAffiliateSource, platform, {
            listingId,
          });
        } else {
          clickId = `play:${listingId}:${Date.now()}`;
        }
      }

      await app.deps.repos.recordCashbackEvent({
        userId: request.user.sub,
        listingId,
        platform,
        clickId,
      });

      trackServerEvent("affiliate_click", {
        userId: request.user.sub,
        source,
        platform,
        listingId,
        clickId,
      });

      return {
        recorded: true as const,
        clickId,
        source,
        platform,
        listingId,
      };
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
