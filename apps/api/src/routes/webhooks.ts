import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { notImplemented } from "../lib/stub.js";

const WebhookAckSchema = z.object({
  received: z.boolean(),
});

export const webhooksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/webhooks/revenuecat",
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
    async (_request, reply) => notImplemented(reply, "POST /webhooks/revenuecat"),
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
};
