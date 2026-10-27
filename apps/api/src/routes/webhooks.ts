import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { notImplemented } from "../lib/stub.js";
import { publishIngestJob } from "../lib/ingest-queue.js";
import { processRevenueCatWebhook } from "../lib/entitlements.js";

const WebhookAckSchema = z.object({
  received: z.boolean(),
  duplicate: z.boolean().optional(),
});

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const webhooksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/webhooks/revenuecat",
    {
      schema: {
        tags: ["webhooks"],
        body: z.record(z.unknown()),
        response: {
          200: WebhookAckSchema,
          401: ErrorSchema,
          400: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = processRevenueCatWebhook(
        request.body as Record<string, unknown>,
        { authorization: request.headers.authorization },
      );
      if (!result.ok) {
        if (result.reason === "invalid_webhook_secret") {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid RevenueCat webhook authorization",
          });
        }
        if (result.reason === "revenuecat_disabled") {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Set FEATURE_REVENUECAT=1 or REVENUECAT_WEBHOOK_SECRET",
          });
        }
        return reply.code(400).send({
          error: "Bad Request",
          message: result.reason,
        });
      }
      return { received: true, duplicate: result.duplicate ?? false };
    },
  );

  app.post(
    "/webhooks/render-callback",
    {
      schema: {
        tags: ["webhooks"],
        body: z.record(z.unknown()),
        response: {
          200: WebhookAckSchema,
          501: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (_request, reply) => notImplemented(reply, "POST /webhooks/render-callback"),
  );

  app.post(
    "/webhooks/email",
    {
      schema: {
        tags: ["webhooks"],
        body: z.record(z.unknown()),
        response: {
          200: WebhookAckSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const secret = request.headers["x-webhook-secret"];
      const expected = process.env.INGEST_WEBHOOK_SECRET;
      if (!expected || secret !== expected) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid or missing X-Webhook-Secret",
        });
      }

      const status = await publishIngestJob({
        kind: "EMAIL",
        payload: request.body,
      });
      console.warn("[audit] ingest.email.webhook", { status });
      return { received: true };
    },
  );
};
