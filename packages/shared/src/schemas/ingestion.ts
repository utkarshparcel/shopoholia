import { z } from "zod";

export const IngestionKindSchema = z.enum(["EMAIL", "SMS", "RECEIPT"]);

export type IngestionKind = z.infer<typeof IngestionKindSchema>;

export const IngestionStatusSchema = z.enum([
  "IDLE",
  "SYNCING",
  "PAUSED",
  "ERROR",
]);

export type IngestionStatus = z.infer<typeof IngestionStatusSchema>;

export const IngestionDocStatusSchema = z.enum([
  "RECEIVED",
  "PARSED",
  "MATCHED",
  "UNMATCHED",
  "ERROR",
]);

export type IngestionDocStatus = z.infer<typeof IngestionDocStatusSchema>;

export const IngestionSourceMetaSchema = z
  .object({
    mutedMerchants: z.array(z.string().min(1)).optional(),
    /** Last human-readable sync/token error (never tokens). */
    lastError: z.string().optional(),
    lastErrorAt: z.string().datetime().optional(),
    /** Machine code: DISCONNECTED | TOKEN_REVOKED | INVALID_GRANT | NO_TOKEN | AUTH_FAILED | … */
    errorCode: z.string().optional(),
    disconnectedAt: z.string().datetime().optional(),
  })
  .passthrough();

export const AccountHealthToneSchema = z.enum([
  "ok",
  "syncing",
  "paused",
  "error",
  "needs_reconnect",
]);

export const AccountHealthSchema = z.object({
  tone: AccountHealthToneSchema,
  label: z.string(),
  status: IngestionStatusSchema,
  lastSyncAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  needsReconnect: z.boolean(),
  hasToken: z.boolean(),
});

export const IngestionSourceSchema = z.object({
  id: z.string().uuid(),
  kind: IngestionKindSchema,
  provider: z.string(),
  consentGrantId: z.string().uuid(),
  status: IngestionStatusSchema,
  cursor: z.string().nullable(),
  lastSyncAt: z.string().datetime().nullable(),
  meta: IngestionSourceMetaSchema.nullable().optional(),
  /** Derived lastError for UI (also nested under health.error). */
  error: z.string().nullable().optional(),
  /** Whether an encrypted OAuth token is present (never the token itself). */
  hasToken: z.boolean().optional(),
  /** N49 connected-account health row. */
  health: AccountHealthSchema.optional(),
});

export const IngestionDocumentSchema = z.object({
  id: z.string().uuid(),
  kind: IngestionKindSchema,
  rawKey: z.string(),
  parsedJson: z.record(z.string(), z.unknown()),
  matchedPurchaseId: z.string().uuid().nullable(),
  status: IngestionDocStatusSchema,
});

export const RegisterIngestionSourceBodySchema = z.object({
  kind: IngestionKindSchema,
  provider: z.string().min(1),
  consentGrantId: z.string().uuid(),
});

export const IngestionSourcesResponseSchema = z.object({
  sources: z.array(IngestionSourceSchema),
});

export const IngestionDocumentsResponseSchema = z.object({
  documents: z.array(IngestionDocumentSchema),
});

export const IngestSmsBodySchema = z.object({
  from: z.string().min(1),
  body: z.string().min(1),
  receivedAt: z.string().datetime().optional(),
});

export const IngestSmsResponseSchema = z.object({
  id: z.string().uuid(),
  status: IngestionDocStatusSchema,
});

export const CreateIngestionSourceResponseSchema = z.object({
  source: IngestionSourceSchema,
  oauthUrl: z.string().url(),
});

/** Safe summary of a read document — never includes raw body or tokens. */
export const IngestionActivityItemSchema = z.object({
  id: z.string().uuid(),
  kind: IngestionKindSchema,
  merchant: z.string().nullable(),
  status: IngestionDocStatusSchema,
  matchedPurchaseId: z.string().uuid().nullable(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  totalMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const IngestionActivityResponseSchema = z.object({
  items: z.array(IngestionActivityItemSchema),
});

export const CorrectIngestionItemSchema = z.object({
  title: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  qty: z.number().int().positive().optional(),
  category: z.string().nullable().optional(),
});

export const CorrectIngestionDocumentBodySchema = z
  .object({
    merchant: z.string().min(1).optional(),
    totalMinor: z.number().int().nonnegative().optional(),
    currency: z.string().min(1).optional(),
    items: z.array(CorrectIngestionItemSchema).optional(),
  })
  .refine(
    (b) =>
      b.merchant !== undefined ||
      b.totalMinor !== undefined ||
      b.currency !== undefined ||
      (b.items !== undefined && b.items.length > 0),
    { message: "At least one correction field is required" },
  );

export const CorrectIngestionDocumentResponseSchema = z.object({
  id: z.string().uuid(),
  status: IngestionDocStatusSchema,
  matchedPurchaseId: z.string().uuid().nullable(),
  merchant: z.string().nullable(),
  totalMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
  /** U041 — training fixture stub id (no raw body). */
  fixtureId: z.string().optional(),
  exportQueued: z.boolean().optional(),
});

export const MuteRuleTypeSchema = z.enum(["merchant", "sender", "subject"]);

export const MuteRuleSchema = z.object({
  id: z.string().min(1),
  type: MuteRuleTypeSchema,
  pattern: z.string().min(1),
  mutedAt: z.string().datetime(),
  previewCount: z.number().int().nonnegative(),
});

export const PatchIngestionSourceBodySchema = z
  .object({
    status: z.enum(["PAUSED", "IDLE"]).optional(),
    mutedMerchants: z.array(z.string().min(1)).optional(),
    /** U043 — sender/subject/merchant pattern mute rules. */
    muteRules: z.array(MuteRuleSchema).optional(),
  })
  .refine(
    (b) =>
      b.status !== undefined ||
      b.mutedMerchants !== undefined ||
      b.muteRules !== undefined,
    { message: "Provide status, mutedMerchants, and/or muteRules" },
  );

export type IngestionSource = z.infer<typeof IngestionSourceSchema>;
export type AccountHealthTone = z.infer<typeof AccountHealthToneSchema>;
export type AccountHealthDto = z.infer<typeof AccountHealthSchema>;
export type IngestionDocument = z.infer<typeof IngestionDocumentSchema>;
export type RegisterIngestionSourceBody = z.infer<
  typeof RegisterIngestionSourceBodySchema
>;
export type IngestionSourcesResponse = z.infer<
  typeof IngestionSourcesResponseSchema
>;
export type IngestionDocumentsResponse = z.infer<
  typeof IngestionDocumentsResponseSchema
>;
export type IngestSmsBody = z.infer<typeof IngestSmsBodySchema>;
export type IngestSmsResponse = z.infer<typeof IngestSmsResponseSchema>;
export type CreateIngestionSourceResponse = z.infer<
  typeof CreateIngestionSourceResponseSchema
>;
export type IngestionActivityItem = z.infer<typeof IngestionActivityItemSchema>;
export type IngestionActivityResponse = z.infer<
  typeof IngestionActivityResponseSchema
>;
export type CorrectIngestionDocumentBody = z.infer<
  typeof CorrectIngestionDocumentBodySchema
>;
export type CorrectIngestionDocumentResponse = z.infer<
  typeof CorrectIngestionDocumentResponseSchema
>;
export type PatchIngestionSourceBody = z.infer<
  typeof PatchIngestionSourceBodySchema
>;
