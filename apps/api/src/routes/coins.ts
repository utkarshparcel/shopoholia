import {
  CoinBalanceResponseSchema,
  CoinLedgerType,
  CoinTransactionsResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const coinsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/coins/balance",
    {
      schema: {
        tags: ["coins"],
        response: {
          200: CoinBalanceResponseSchema,
          401: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const balance = await app.deps.repos.getCoinBalance(request.user.sub);
      return { balance };
    },
  );

  app.get(
    "/coins/transactions",
    {
      schema: {
        tags: ["coins"],
        querystring: z.object({
          cursor: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: {
          200: CoinTransactionsResponseSchema,
          401: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const { transactions, nextCursor } = await app.deps.repos.listCoinTransactions({
        userId: request.user.sub,
        cursor: request.query.cursor,
        limit: request.query.limit,
      });

      return {
        transactions: transactions.map((tx) => ({
          id: tx.id,
          delta: tx.delta,
          type: CoinLedgerType.parse(tx.type),
          balanceAfter: tx.balanceAfter,
          createdAt: tx.createdAt.toISOString(),
        })),
        nextCursor,
      };
    },
  );

  app.post(
    "/coins/iap/validate",
    {
      schema: {
        tags: ["coins"],
        body: z.object({
          receipt: z.string().min(1),
          productId: z.string().min(1),
          idempotencyKey: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            coinsGranted: z.number().int().nonnegative(),
            balance: z.number().int().nonnegative(),
          }),
          501: ErrorSchema,
        },
      },
    },
    async (_request, reply) =>
      reply.code(501).send({ error: "Not Implemented", message: "POST /coins/iap/validate" }),
  );
};
