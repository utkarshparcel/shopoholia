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
  confirmPaymentIntent,
  createPaymentIntent,
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
        },
      },
    },
    async (request, reply) => {
      try {
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
        return createPaymentIntent({
          userId: request.user!.sub,
          productId: request.body.productId,
          region,
          method: request.body.method,
        });
      } catch (err) {
        return reply.code(400).send({
          error: "Bad Request",
          message: err instanceof Error ? err.message : "Invalid payment",
        });
      }
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
        },
      },
    },
    async (request, reply) => {
      try {
        return confirmPaymentIntent({
          intentId: request.body.intentId,
          userId: request.user!.sub,
          providerPaymentId: request.body.providerPaymentId,
        });
      } catch {
        return reply.code(404).send({
          error: "Not Found",
          message: "Payment intent not found",
        });
      }
    },
  );
};
