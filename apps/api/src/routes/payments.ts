import {
  ConfirmPaymentBodySchema,
  ConfirmPaymentResponseSchema,
  CreatePaymentIntentBodySchema,
  PaymentIntentSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import {
  PaymentIntentNotFoundError,
  PaymentRequestError,
  PaymentSignatureError,
  PaymentsUnavailableError,
  confirmPaymentIntent,
  createPaymentIntent,
  getPaymentIntent,
  resolveRegion,
  upiExperimentEnabled,
} from "../lib/payments/adapter.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const paymentsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/payments/intents",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["payments"],
        body: CreatePaymentIntentBodySchema,
        response: {
          200: PaymentIntentSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const region = request.body.region ?? resolveRegion();
      if (
        process.env.NODE_ENV === "production" &&
        request.body.method === "upi" &&
        !upiExperimentEnabled()
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "UPI experiment flag off (set EXPERIMENT_UPI_CHECKOUT=1)",
        });
      }
      try {
        return await createPaymentIntent(app.deps.repos, {
          userId: request.user!.sub,
          productId: request.body.productId,
          region,
          method: request.body.method,
        });
      } catch (err) {
        if (err instanceof PaymentRequestError) {
          return reply.code(400).send({ error: "Bad Request", message: err.message });
        }
        if (err instanceof PaymentsUnavailableError) {
          request.log.warn({ err }, "payment intent unavailable");
          return reply.code(503).send({ error: "Service Unavailable", message: err.message });
        }
        throw err;
      }
    },
  );

  app.get(
    "/payments/intents/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["payments"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: PaymentIntentSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const intent = await getPaymentIntent(app.deps.repos, request.params.id, request.user!.sub);
      if (!intent) {
        return reply.code(404).send({ error: "Not Found", message: "Payment intent not found" });
      }
      // Polled while a payment settles; never serve a stale status.
      reply.header("cache-control", "no-store");
      return intent;
    },
  );

  app.post(
    "/payments/confirm",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["payments"],
        body: ConfirmPaymentBodySchema,
        response: {
          200: ConfirmPaymentResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await confirmPaymentIntent(app.deps.repos, {
          intentId: request.body.intentId,
          userId: request.user!.sub,
          providerPaymentId: request.body.providerPaymentId,
          providerOrderId: request.body.providerOrderId,
          providerSignature: request.body.providerSignature,
        });
      } catch (err) {
        if (err instanceof PaymentIntentNotFoundError) {
          return reply.code(404).send({ error: "Not Found", message: "Payment intent not found" });
        }
        if (err instanceof PaymentSignatureError || err instanceof PaymentRequestError) {
          return reply.code(400).send({ error: "Bad Request", message: err.message });
        }
        if (err instanceof PaymentsUnavailableError) {
          return reply.code(503).send({ error: "Service Unavailable", message: err.message });
        }
        throw err;
      }
    },
  );
};
