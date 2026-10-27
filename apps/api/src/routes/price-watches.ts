import {
  BrandPriceWatchListResponseSchema,
  BrandPriceWatchSchema,
  CreateBrandPriceWatchBodySchema,
  PriceDropScanResponseSchema,
  type CreateBrandPriceWatchBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { scanBrandPriceDrops } from "../lib/price-drop.js";
import type { BrandPriceWatchRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toWatchJson(w: BrandPriceWatchRecord) {
  return {
    id: w.id,
    userId: w.userId,
    brand: w.brand,
    watchedPriceMinor: w.watchedPriceMinor,
    thresholdPct: w.thresholdPct,
    lastSeenPriceMinor: w.lastSeenPriceMinor,
    active: w.active,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export const priceWatchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/price-watches",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["recover"],
        response: { 200: BrandPriceWatchListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const list = await app.deps.repos.listBrandPriceWatches(request.user!.sub);
      return { watches: list.map(toWatchJson) };
    },
  );

  app.post(
    "/price-watches",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["recover"],
        body: CreateBrandPriceWatchBodySchema,
        response: { 201: BrandPriceWatchSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateBrandPriceWatchBody;
      const created = await app.deps.repos.createBrandPriceWatch({
        userId,
        brand: body.brand,
        watchedPriceMinor: body.watchedPriceMinor,
        thresholdPct: body.thresholdPct,
      });
      trackServerEvent("price_watch_created", {
        userId,
        watchId: created.id,
        brand: created.brand,
        thresholdPct: created.thresholdPct,
      });
      return reply.code(201).send(toWatchJson(created));
    },
  );

  app.post(
    "/price-watches/scan",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["recover"],
        response: { 200: PriceDropScanResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const result = await scanBrandPriceDrops(app.deps.repos, userId);
      trackServerEvent("price_drop_scan", {
        userId,
        hits: result.hits.length,
        scannedListings: result.scannedListings,
      });
      return result;
    },
  );
};
