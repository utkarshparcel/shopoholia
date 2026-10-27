import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { requireAuth } from "../lib/auth/guard.js";
import {
  exportSettlementsCsv,
  listSettlements,
  settleCompletedOrder,
} from "../lib/take-rate.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const SettlementSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["tailoring", "resale"]),
  orderRef: z.string(),
  sellerId: z.string(),
  orderAmountMinor: z.number().int(),
  platformFeeMinor: z.number().int(),
  gstOnFeeMinor: z.number().int(),
  sellerPayoutMinor: z.number().int(),
  currency: z.string(),
  completedAt: z.string(),
});

const SettleBodySchema = z.object({
  kind: z.enum(["tailoring", "resale"]),
  orderRef: z.string().min(1),
  sellerId: z.string().min(1),
  orderAmountMinor: z.number().int().positive(),
  currency: z.string().default("INR"),
  applyGst: z.boolean().optional(),
});

export const marketplaceSettlementsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/marketplace/settlements",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["marketplace"],
        body: SettleBodySchema,
        response: {
          200: SettlementSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const row = settleCompletedOrder({
        kind: request.body.kind,
        orderRef: request.body.orderRef,
        sellerId: request.body.sellerId,
        orderAmountMinor: request.body.orderAmountMinor,
        currency: request.body.currency,
        applyGst: request.body.applyGst,
      });
      if (!row) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Settlement skipped (feature off or invalid amount)",
        });
      }
      return row;
    },
  );

  app.get(
    "/marketplace/settlements",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["marketplace"],
        querystring: z.object({
          kind: z.enum(["tailoring", "resale"]).optional(),
          sellerId: z.string().optional(),
        }),
        response: {
          200: z.object({ settlements: z.array(SettlementSchema) }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => ({
      settlements: listSettlements({
        kind: request.query.kind,
        sellerId: request.query.sellerId,
      }),
    }),
  );

  app.get(
    "/marketplace/settlements/export.csv",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["marketplace"],
        querystring: z.object({
          kind: z.enum(["tailoring", "resale"]).optional(),
          sellerId: z.string().optional(),
        }),
        response: {
          200: z.string(),
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const csv = exportSettlementsCsv({
        kind: request.query.kind,
        sellerId: request.query.sellerId,
      });
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", 'attachment; filename="settlements.csv"')
        .send(csv);
    },
  );
};
