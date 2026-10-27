import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { computeIngestionMetrics } from "../lib/ingestion-metrics.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const MetricsResponseSchema = z.object({
  totalMessages: z.number(),
  specificHits: z.number(),
  genericHits: z.number(),
  misses: z.number(),
  coverage: z.number(),
  byStatus: z.record(z.string(), z.number()),
  byKind: z.record(z.string(), z.number()),
  byMerchant: z.record(z.string(), z.number()),
  costEstimate: z.object({
    perMessageMinor: z.number(),
    estimatedTotalMinor: z.number(),
    currency: z.string(),
  }),
  note: z.string(),
  deadLetterCount: z.number().optional(),
  errorRate: z.number().optional(),
});

export const ingestionMetricsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/ingestion/metrics",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        response: {
          200: MetricsResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      // Always scope to the authenticated user — never global lists.
      const [documents, purchases] = await Promise.all([
        app.deps.repos.listIngestionDocumentsByUser(userId),
        app.deps.repos.listMerchantPurchasesByUser(userId),
      ]);

      return computeIngestionMetrics(documents, purchases);
    },
  );
};
