import {
  CoinBalanceResponseSchema,
  CoinLedgerType,
  CoinTransactionsResponseSchema,
  IapValidateBodySchema,
  IapValidateResponseSchema,
  coinPackById,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function isSimulatedReceipt(receipt: string): boolean {
  return receipt.startsWith("simulated-receipt") || receipt.includes("simulated");
}

function iapEventId(receipt: string, revenuecatEventId?: string): string {
  if (revenuecatEventId) return revenuecatEventId;
  return createHash("sha256").update(receipt).digest("hex");
}

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
        body: IapValidateBodySchema,
        response: {
          200: IapValidateResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          409: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      if (process.env.NODE_ENV === "production" && isSimulatedReceipt(request.body.receipt)) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Simulated receipts are not accepted in production",
        });
      }

      const pack = coinPackById(request.body.productId);
      if (!pack) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `Unknown product: ${request.body.productId}`,
        });
      }

      const eventId = iapEventId(request.body.receipt, request.body.revenuecatEventId);
      const existing = await app.deps.repos.findIapReceipt(eventId);
      if (existing) {
        if (existing.userId !== request.user.sub) {
          return reply.code(409).send({
            error: "Conflict",
            message: "Receipt already redeemed",
          });
        }
        const balanceAfter = await app.deps.repos.getCoinBalance(request.user.sub);
        return {
          success: true as const,
          coinsGranted: existing.coinsGranted,
          balanceAfter,
        };
      }

      const { balanceAfter } = await app.deps.repos.grantCoins({
        userId: request.user.sub,
        delta: pack.coins,
        type: "IAP_PURCHASE",
        refType: "iap",
      });

      await app.deps.repos.recordIapReceipt({
        eventId,
        userId: request.user.sub,
        productId: request.body.productId,
        coinsGranted: pack.coins,
        rawPayload: { receipt: request.body.receipt },
      });

      return { success: true as const, coinsGranted: pack.coins, balanceAfter };
    },
  );
};
