import {
  EntitlementSnapshotSchema,
  EntitlementSyncBodySchema,
  EntitlementSyncResponseSchema,
  PaywallOfferingsResponseSchema,
  buildRegionalOfferings,
  selectPaymentMethod,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import {
  grantTrial,
  premiumGatesEnabled,
  revenueCatEnabled,
  snapshotForUser,
} from "../lib/entitlements.js";
import {
  paymentsProviderHint,
  resolveRegion,
  upiExperimentEnabled,
} from "../lib/payments/adapter.js";

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
    async (request) => snapshotForUser(request.user!.sub),
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
    async (request) => {
      const region = request.query.region ?? resolveRegion();
      const offerings = buildRegionalOfferings(region).map((o) => ({
        productId: o.productId,
        label: o.label,
        entitlementIds: o.entitlementIds,
        trialDays: o.trialDays,
        priceLabel: o.priceLabel,
        currency: o.currency,
      }));
      const method = selectPaymentMethod({
        region,
        upiExperimentEnabled: upiExperimentEnabled(),
        revenueCatEnabled: revenueCatEnabled(),
      });
      const provider =
        method === "upi"
          ? ("upi" as const)
          : revenueCatEnabled()
            ? ("revenuecat" as const)
            : ("none" as const);
      return {
        offerings,
        gatesEnabled: premiumGatesEnabled(),
        provider,
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
        },
      },
    },
    async (request, reply) => {
      if (
        process.env.NODE_ENV === "production" &&
        request.body.receiptOrToken?.startsWith("simulated")
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Simulated receipts are not accepted in production",
        });
      }
      const source =
        paymentsProviderHint() === "razorpay_upi" || paymentsProviderHint() === "stub"
          ? ("dev" as const)
          : ("revenuecat" as const);
      const snapshot = grantTrial(request.user!.sub, request.body.productId, source);
      if (snapshot.grants.length === 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `Unknown product: ${request.body.productId}`,
        });
      }
      return { snapshot };
    },
  );
};
