import {
  COIN_PACKS,
  CoinBalanceResponseSchema,
  CoinLedgerType,
  CoinPacksResponseSchema,
  CoinTransactionsResponseSchema,
  IapValidateBodySchema,
  IapValidateResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { validateCoinPurchase } from "../lib/coin-purchases.js";

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
    "/coins/packs",
    {
      schema: {
        tags: ["coins"],
        response: { 200: CoinPacksResponseSchema },
      },
    },
    async (_request, reply) => {
      reply.header("cache-control", "public, max-age=300");
      const stores = app.deps.purchaseVerifier.stores;
      return {
        purchasesAvailable: stores.app_store || stores.play_store,
        stores: { app_store: stores.app_store, play_store: stores.play_store },
        packs: COIN_PACKS.map((pack) => ({
          id: pack.id,
          storeProductId: pack.storeProductId,
          label: pack.label,
          coins: pack.coins,
          ...("popular" in pack ? { popular: pack.popular } : {}),
          ...("bestValue" in pack ? { bestValue: pack.bestValue } : {}),
        })),
      };
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

  // Credits a store purchase only after the purchase verifier confirms it, with the coins COIN_PACKS
  // defines. Contract: FIX/platform/iap-contract.md.
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
          402: ErrorSchema,
          409: ErrorSchema,
          503: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const outcome = await validateCoinPurchase(
        app.deps.repos,
        app.deps.purchaseVerifier,
        request.user.sub,
        request.body,
      );
      if (!outcome.ok) {
        if (outcome.status === 503) {
          request.log.warn({ reason: outcome.reason, store: request.body.store }, "coin purchase unverifiable");
        } else {
          request.log.info(
            { status: outcome.status, error: outcome.error, reason: outcome.message, store: request.body.store },
            "coin purchase rejected",
          );
        }
        return reply.code(outcome.status).send({ error: outcome.error, message: outcome.message });
      }
      return {
        success: true as const,
        coinsGranted: outcome.purchase.coinsGranted,
        balanceAfter: outcome.balanceAfter,
        packId: outcome.pack.id,
        transactionId: outcome.purchase.transactionId,
        alreadyGranted: outcome.alreadyGranted,
        refunded: outcome.purchase.refundedAt !== null,
        ...(outcome.needsConsume !== undefined ? { needsConsume: outcome.needsConsume } : {}),
      };
    },
  );
};
