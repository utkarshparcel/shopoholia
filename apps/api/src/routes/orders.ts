import {
  CreateOrderBodySchema,
  OrderListResponseSchema,
  OrderParamsSchema,
  OrderSummarySchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { CheckoutError, checkoutOrder } from "../lib/orders/checkout.js";
import { orderSummaryDto } from "../lib/orders/dto.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const ordersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/orders",
    {
      schema: {
        tags: ["orders"],
        body: CreateOrderBodySchema,
        response: {
          201: OrderSummarySchema,
          400: ErrorSchema,
          401: ErrorSchema,
          402: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      try {
        const order = await checkoutOrder(app.deps, {
          userId: request.user.sub,
          tier: request.body.tier,
          idempotencyKey: request.body.idempotencyKey,
        });
        return reply.code(201).send(orderSummaryDto(order));
      } catch (error) {
        if (error instanceof CheckoutError) {
          const status = error.code === "INSUFFICIENT_COINS" ? 402 : 400;
          return reply.code(status).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/orders",
    {
      schema: {
        tags: ["orders"],
        response: {
          200: OrderListResponseSchema,
          401: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const orders = await app.deps.repos.listOrdersByUserId(request.user.sub);
      return { orders: orders.map(orderSummaryDto) };
    },
  );

  app.get(
    "/orders/:id",
    {
      schema: {
        tags: ["orders"],
        params: OrderParamsSchema,
        response: {
          200: OrderSummarySchema,
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
      return orderSummaryDto(order);
    },
  );
};
