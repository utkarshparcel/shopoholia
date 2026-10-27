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

/** Version of the privacy notice the app shows today; recorded on a grant when the client sends none. */
export const CONSENT_NOTICE_VERSION = "2026-10-26";

export const ConsentGrantSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  scope: ConsentScopeSchema,
  grantedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  source: z.string(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  /** Privacy notice version the grant was given under (null on grants from before v2). */
  noticeVersion: z.string().nullable().optional(),
});

export const GrantConsentBodySchema = z.object({
  /** Ignored: the grant is always for the signed-in user. Optional so old clients still parse. */
  userId: z.string().uuid().optional(),
  scope: ConsentScopeSchema,
  source: z.string().min(1).max(64),
  meta: z.record(z.string(), z.unknown()).optional(),
  /** Notice version the app showed; defaults to CONSENT_NOTICE_VERSION. */
  noticeVersion: z.string().min(1).max(32).optional(),
});

export const RevokeConsentBodySchema = z.object({
  grantId: z.string().uuid(),
});

export const ConsentListResponseSchema = z.object({
  grants: z.array(ConsentGrantSchema),
});

/** One append-only consent event (a grant or a withdrawal). */
export const ConsentRecordSchema = z.object({
  id: z.string().uuid(),
  scope: ConsentScopeSchema,
  action: z.enum(["GRANT", "WITHDRAW"]),
  noticeVersion: z.string().nullable(),
  source: z.string(),
  grantId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
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
  /** The account row itself (prefs, flags, time zone). Optional: added with export v2. */
  user: z.record(z.string(), z.unknown()).optional(),
  /**
   * Every other user table, keyed by table name (export v2). The coverage test in
   * apps/api fails when a table with a user column is neither here nor exempted.
   */
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
});

export type VaultExport = z.infer<typeof VaultExportSchema>;

export const GrantConsentResponseSchema = ConsentGrantSchema;

/** A queued or finished erasure / export request (DELETE /vault, POST /vault/export). */
export const PrivacyRequestSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["ERASE", "EXPORT"]),
  status: z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]),
  requestedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  /** EXPORT when DONE: short-lived signed URL of the JSON file. */
  downloadUrl: z.string().nullable().optional(),
});

export type ConsentGrant = z.infer<typeof ConsentGrantSchema>;
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;
export type PrivacyRequest = z.infer<typeof PrivacyRequestSchema>;
export type GrantConsentBody = z.infer<typeof GrantConsentBodySchema>;
export type RevokeConsentBody = z.infer<typeof RevokeConsentBodySchema>;
export type ConsentListResponse = z.infer<typeof ConsentListResponseSchema>;
