import { z } from "zod";
import { CLOSET_ENTITLEMENTS } from "../entitlements.js";

export const ClosetEntitlementSchema = z.enum(CLOSET_ENTITLEMENTS);

export const EntitlementGrantSchema = z.object({
  entitlementId: ClosetEntitlementSchema,
  productId: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  isTrial: z.boolean(),
  source: z.enum(["revenuecat", "upi", "dev"]),
});

export const EntitlementSnapshotSchema = z.object({
  userId: z.string().uuid(),
  grants: z.array(EntitlementGrantSchema),
  asOf: z.string().datetime(),
});

export const EntitlementSyncBodySchema = z.object({
  productId: z.string().min(1),
  /** Simulated / RC customer info token — never a store secret. */
  receiptOrToken: z.string().min(1).optional(),
  startTrial: z.boolean().optional().default(true),
});

export const EntitlementSyncResponseSchema = z.object({
  snapshot: EntitlementSnapshotSchema,
});

export const PaywallOfferingSchema = z.object({
  productId: z.string(),
  label: z.string(),
  entitlementIds: z.array(ClosetEntitlementSchema),
  trialDays: z.number().int().nonnegative(),
  /** Display price from regional table when available. */
  priceLabel: z.string().nullable(),
  currency: z.string().nullable(),
});

export const PaywallOfferingsResponseSchema = z.object({
  offerings: z.array(PaywallOfferingSchema),
  gatesEnabled: z.boolean(),
  provider: z.enum(["revenuecat", "upi", "none"]),
});

export type EntitlementGrantDto = z.infer<typeof EntitlementGrantSchema>;
export type EntitlementSnapshotDto = z.infer<typeof EntitlementSnapshotSchema>;
export type EntitlementSyncBody = z.infer<typeof EntitlementSyncBodySchema>;
export type PaywallOfferingsResponse = z.infer<typeof PaywallOfferingsResponseSchema>;
