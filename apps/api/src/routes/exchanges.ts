import {
  ExchangeWindowsListResponseSchema,
  daysLeft,
  merchantWindowsDiffer,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const exchangesRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /exchanges — open exchange windows (≠ return windows when merchant differs)
  app.get(
    "/exchanges",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["exchanges"],
        response: { 200: ExchangeWindowsListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const now = new Date();
      const purchases = await app.deps.repos.listMerchantPurchases(userId);
      const open = purchases.filter((p) => {
        if (!p.exchangeWindowDeadline) return false;
        return p.exchangeWindowDeadline.getTime() > now.getTime();
      });

      const ids = open.map((p) => p.id);
      const itemsByPurchase =
        await app.deps.repos.listMerchantPurchaseItemsByPurchaseIds(ids);

      return {
        exchanges: open.map((p) => {
          const windowsDiffer =
            merchantWindowsDiffer(p.merchant) ||
            (p.returnWindowDeadline &&
              p.exchangeWindowDeadline &&
              p.returnWindowDeadline.getTime() !==
                p.exchangeWindowDeadline.getTime()) ||
            false;
          return {
            purchaseId: p.id,
            merchant: p.merchant,
            orderRef: p.orderRef,
            purchasedAt: p.purchasedAt.toISOString(),
            returnWindowDeadline: p.returnWindowDeadline?.toISOString() ?? null,
            exchangeWindowDeadline:
              p.exchangeWindowDeadline?.toISOString() ?? null,
            windowsDiffer: Boolean(windowsDiffer),
            daysLeftExchange: daysLeft(p.exchangeWindowDeadline, now),
            daysLeftReturn: daysLeft(p.returnWindowDeadline, now),
            itemTitles: (itemsByPurchase.get(p.id) ?? []).map((i) => i.title),
          };
        }),
      };
    },
  );
};
