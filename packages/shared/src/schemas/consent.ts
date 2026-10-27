import { z } from "zod";

export const ConsentScopeSchema = z.enum([
  "EMAIL",
  "SMS",
  "FINANCIAL",
  "LIKENESS",
  /** White-glove operator may ingest/sort/list on the user's behalf. */
  "CONCIERGE",
]);

export type ConsentScope = z.infer<typeof ConsentScopeSchema>;

export const ConsentGrantSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  scope: ConsentScopeSchema,
  grantedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  source: z.string(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});

export const GrantConsentBodySchema = z.object({
  userId: z.string().uuid(),
  scope: ConsentScopeSchema,
  source: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const RevokeConsentBodySchema = z.object({
  grantId: z.string().uuid(),
});

export const ConsentListResponseSchema = z.object({
  grants: z.array(ConsentGrantSchema),
});

/** Full self-service data export (GDPR-style). Complex sub-objects are carried
 * as open records so the shape can grow without breaking the contract. */
export const VaultExportSchema = z.object({
  grants: z.array(z.record(z.string(), z.unknown())),
  moneyAccounts: z.array(z.record(z.string(), z.unknown())),
  moneyLedger: z.array(z.record(z.string(), z.unknown())),
  receipts: z.array(z.record(z.string(), z.unknown())),
  warranties: z.array(z.record(z.string(), z.unknown())),
  ingestionSources: z.array(z.record(z.string(), z.unknown())),
  merchantPurchases: z.array(z.record(z.string(), z.unknown())),
  merchantPurchaseItems: z.array(z.record(z.string(), z.unknown())),
  ingestionDocuments: z.array(z.record(z.string(), z.unknown())),
  orders: z.array(z.record(z.string(), z.unknown())),
  orderItems: z.array(z.record(z.string(), z.unknown())),
  carts: z.array(z.record(z.string(), z.unknown())),
  cartItems: z.array(z.record(z.string(), z.unknown())),
  sellers: z.array(z.record(z.string(), z.unknown())),
  listings: z.array(z.record(z.string(), z.unknown())),
  listingVariants: z.array(z.record(z.string(), z.unknown())),
  avatars: z.array(z.record(z.string(), z.unknown())),
  renders: z.array(z.record(z.string(), z.unknown())),
  tryonPreviews: z.array(z.record(z.string(), z.unknown())),
  pushEvents: z.array(z.record(z.string(), z.unknown())),
  coinLedger: z.array(z.record(z.string(), z.unknown())),
  iapReceipts: z.array(z.record(z.string(), z.unknown())),
  cashbackEvents: z.array(z.record(z.string(), z.unknown())),
  budgets: z.array(z.record(z.string(), z.unknown())),
  spendRollups: z.array(z.record(z.string(), z.unknown())),
  returnRequests: z.array(z.record(z.string(), z.unknown())),
  returnEvents: z.array(z.record(z.string(), z.unknown())),
  recipients: z.array(z.record(z.string(), z.unknown())),
  recipientProfiles: z.array(z.record(z.string(), z.unknown())),
  giftOrders: z.array(z.record(z.string(), z.unknown())),
  measurementProfiles: z.array(z.record(z.string(), z.unknown())),
  customizationTemplates: z.array(z.record(z.string(), z.unknown())),
  tailoringOrders: z.array(z.record(z.string(), z.unknown())),
  wardrobeItems: z.array(z.record(z.string(), z.unknown())),
  outfits: z.array(z.record(z.string(), z.unknown())),
  wearLog: z.array(z.record(z.string(), z.unknown())),
  itemMetrics: z.array(z.record(z.string(), z.unknown())),
  dispositionListings: z.array(z.record(z.string(), z.unknown())),
});

export type VaultExport = z.infer<typeof VaultExportSchema>;

export const GrantConsentResponseSchema = ConsentGrantSchema;

export type ConsentGrant = z.infer<typeof ConsentGrantSchema>;
export type GrantConsentBody = z.infer<typeof GrantConsentBodySchema>;
export type RevokeConsentBody = z.infer<typeof RevokeConsentBodySchema>;
export type ConsentListResponse = z.infer<typeof ConsentListResponseSchema>;
