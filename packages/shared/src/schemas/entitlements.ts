import { z } from "zod";
import { CLOSET_ENTITLEMENTS } from "../entitlements.js";

export const ClosetEntitlementSchema = z.enum(CLOSET_ENTITLEMENTS);

export const EntitlementGrantSchema = z.object({
  entitlementId: ClosetEntitlementSchema,
  productId: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  isTrial: z.boolean(),
  source: z.enum(["app_store", "play_store", "upi", "dev"]),
});

export const EntitlementSnapshotSchema = z.object({
  userId: z.string().uuid(),
  grants: z.array(EntitlementGrantSchema),
  asOf: z.string().datetime(),
});

export const EntitlementSyncBodySchema = z.object({
  /** Closet product id (`closet_premium_monthly`), not the store product id. */
  productId: z.string().min(1),
  /** Ignored: kept so older builds still parse. */
  receiptOrToken: z.string().min(1).optional(),
  startTrial: z.boolean().optional().default(true),
  /** The store the subscription was bought in. Required outside dev simulation. */
  store: z.enum(["app_store", "play_store"]).optional(),
  /** app_store: the subscription transaction's `jwsRepresentation`. */
  jws: z.string().min(1).max(20_000).optional(),
  /** play_store: the subscription's `purchaseToken`. */
  purchaseToken: z.string().min(1).max(4_000).optional(),
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
  /** The App Store / Google Play subscription id to buy. */
  storeProductId: z.string().optional(),
});

export const PaywallOfferingsResponseSchema = z.object({
  offerings: z.array(PaywallOfferingSchema),
  gatesEnabled: z.boolean(),
  /** "store": buy through the App Store / Google Play; "none": purchases are unavailable. */
  provider: z.enum(["store", "none"]),
  /** Per store: whether the server can verify that store's purchases now. */
  stores: z.object({ app_store: z.boolean(), play_store: z.boolean() }).optional(),
});

export type EntitlementGrantDto = z.infer<typeof EntitlementGrantSchema>;
export type EntitlementSnapshotDto = z.infer<typeof EntitlementSnapshotSchema>;
export type EntitlementSyncBody = z.infer<typeof EntitlementSyncBodySchema>;
export type PaywallOfferingsResponse = z.infer<typeof PaywallOfferingsResponseSchema>;
