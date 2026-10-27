import {
  EntitlementSnapshotSchema,
  EntitlementSyncBodySchema,
  EntitlementSyncResponseSchema,
  PREMIUM_SUBSCRIPTIONS,
  PaywallOfferingsResponseSchema,
  buildRegionalOfferings,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import {
  premiumGatesEnabled,
  snapshotForUser,
  syncStoreSubscription,
} from "../lib/entitlements.js";
import { resolveRegion } from "../lib/payments/adapter.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const entitlementsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/entitlements",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["entitlements"],
        response: { 200: EntitlementSnapshotSchema, 401: ErrorSchema },
      },
    },
    async (request) => snapshotForUser(app.deps.repos, request.user!.sub),
  );

  app.get(
    "/entitlements/offerings",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["entitlements"],
        querystring: z.object({
          region: z.enum(["IN", "US", "GLOBAL"]).optional(),
        }),
        response: { 200: PaywallOfferingsResponseSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      // Offerings come from static config; a short private cache spares repeat paywall loads.
      reply.header("cache-control", "private, max-age=300");
      const region = request.query.region ?? resolveRegion();
      const offerings = buildRegionalOfferings(region).map((o) => ({
        productId: o.productId,
        label: o.label,
        entitlementIds: o.entitlementIds,
        trialDays: o.trialDays,
        priceLabel: o.priceLabel,
        currency: o.currency,
        storeProductId: PREMIUM_SUBSCRIPTIONS.find((s) => s.productId === o.productId)?.storeProductId,
      }));
      // Premium is a digital good: sold only through App Store / Google Play billing.
      const stores = app.deps.purchaseVerifier.stores;
      return {
        offerings,
        gatesEnabled: premiumGatesEnabled(),
        provider: stores.app_store || stores.play_store ? ("store" as const) : ("none" as const),
        stores: { app_store: stores.app_store, play_store: stores.play_store },
      };
    },
  );

  app.post(
    "/entitlements/sync",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["entitlements"],
        body: EntitlementSyncBodySchema,
        response: {
          200: EntitlementSyncResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          402: ErrorSchema,
          409: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const outcome = await syncStoreSubscription(
        app.deps.repos,
        app.deps.purchaseVerifier,
        request.user!.sub,
        request.body,
      );
      if (!outcome.ok) {
        if (outcome.status === 503) {
          request.log.warn({ reason: outcome.reason, store: request.body.store }, "subscription unverifiable");
        }
        return reply.code(outcome.status).send({ error: outcome.error, message: outcome.message });
      }
      return { snapshot: outcome.snapshot };
    },
  );
};
