import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { notImplemented } from "../lib/stub.js";
import { publishIngestJob } from "../lib/ingest-queue.js";
import { processAppStoreNotification } from "../lib/iap/notifications.js";
import { processRazorpayWebhook } from "../lib/payments/adapter.js";

const WebhookAckSchema = z.object({
  received: z.boolean(),
  duplicate: z.boolean().optional(),
  /** Why a verified event changed nothing (unknown user or product, unsupported type). */
  ignored: z.string().optional(),
});

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const webhooksRoutes: FastifyPluginAsyncZod = async (app) => {
  // App Store Server Notifications V2. Apple retries anything but a 200, so a verified notification
  // that changes nothing is still acknowledged.
  app.post(
    "/webhooks/app-store",
    {
      schema: {
        tags: ["webhooks"],
        body: z.object({ signedPayload: z.string().min(1).max(200_000) }),
        response: {
          200: WebhookAckSchema,
          400: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await processAppStoreNotification(
        app.deps.repos,
        app.deps.storeConnections.apple,
        request.body.signedPayload,
      );
      if (!result.ok) {
        if (result.reason === "unconfigured") {
          request.log.warn("app store notification received but APPLE_BUNDLE_ID is not set");
          return reply.code(503).send({ error: "Service Unavailable", message: result.message });
        }
        request.log.warn({ reason: result.message }, "app store notification rejected");
        return reply.code(400).send({ error: "Bad Request", message: result.message });
      }
      if (result.ignored) request.log.info({ ignored: result.ignored }, "app store notification ignored");
      return { received: true, duplicate: result.duplicate ?? false, ignored: result.ignored };
    },
  );

  // Razorpay signs the exact bytes it sent, so this route keeps the raw body.
  await app.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer", bodyLimit: 256 * 1024 },
      (_request, body, done) => done(null, body),
    );

    scope.post(
      "/webhooks/razorpay",
      {
        schema: {
          tags: ["webhooks"],
          response: {
            200: WebhookAckSchema,
            400: ErrorSchema,
            401: ErrorSchema,
            503: ErrorSchema,
          },
        },
      },
      async (request, reply) => {
        if (!Buffer.isBuffer(request.body)) {
          return reply.code(400).send({ error: "Bad Request", message: "Expected a JSON body" });
        }
        const signature = request.headers["x-razorpay-signature"];
        const result = await processRazorpayWebhook(
          app.deps.repos,
          request.body,
          typeof signature === "string" ? signature : undefined,
        );
        if (!result.ok) {
          if (result.reason === "invalid_signature") {
            return reply.code(401).send({ error: "Unauthorized", message: result.message });
          }
          if (result.reason === "unconfigured") {
            return reply.code(503).send({ error: "Service Unavailable", message: result.message });
          }
          return reply.code(400).send({ error: "Bad Request", message: result.message });
        }
        if (result.ignored) request.log.warn({ ignored: result.ignored }, "razorpay event ignored");
        return { received: true, ignored: result.ignored };
      },
    );
  });

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
