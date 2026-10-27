import { z } from "zod";

export const WarrantyStateSchema = z.enum([
  "ACTIVE",
  "CLAIMED",
  "EXPIRED",
]);

export type WarrantyState = z.infer<typeof WarrantyStateSchema>;

export const WarrantyCategorySchema = z.enum([
  "electronics",
  "appliances",
  "apparel",
]);

export type WarrantyCategoryName = z.infer<typeof WarrantyCategorySchema>;

export const WarrantySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  receiptId: z.string().uuid().nullable(),
  itemTitle: z.string(),
  provider: z.string(),
  coverageUntil: z.string().datetime(),
  claimContact: z.string().nullable(),
  /** electronics | appliances | apparel when known. */
  category: WarrantyCategorySchema.nullable().optional(),
  state: WarrantyStateSchema,
  createdAt: z.string().datetime(),
});

export type Warranty = z.infer<typeof WarrantySchema>;

export const WarrantyListResponseSchema = z.object({
  warranties: z.array(WarrantySchema),
});

export type WarrantyListResponse = z.infer<typeof WarrantyListResponseSchema>;

/** U011 — claim packet for share sheet (email body + attachment keys). */
export const WarrantyClaimPacketSchema = z.object({
  emailBody: z.string(),
  subject: z.string(),
  attachmentKeys: z.array(z.string()),
  shareText: z.string(),
});

export type WarrantyClaimPacketDto = z.infer<typeof WarrantyClaimPacketSchema>;

/** Claim flips state and returns a one-tap mailto / deep-link when contact exists. */
export const ClaimWarrantyResponseSchema = WarrantySchema.extend({
  /** Prefilled claim rail (mailto / https / tel). Null when no usable contact. */
  claimUrl: z.string().nullable(),
  /** Merchant order / invoice ref when known from the linked purchase. */
  orderRef: z.string().nullable(),
  /** U011 — email body + attachment keys for share sheet. */
  packet: WarrantyClaimPacketSchema,
  /** ISO time claim was marked (for 24h undo). */
  claimedAt: z.string().datetime().nullable().optional(),
  /** Whether undo is still available. */
  canUnclaim: z.boolean().optional(),
});

export type ClaimWarrantyResponse = z.infer<typeof ClaimWarrantyResponseSchema>;

export const SnoozeWarrantyBodySchema = z.object({
  /** Days to push the reminder (default 3). */
  days: z.number().int().positive().max(30).optional(),
  /** Absolute snooze-until; wins over days when both set. */
  until: z.string().datetime().optional(),
});

export type SnoozeWarrantyBody = z.infer<typeof SnoozeWarrantyBodySchema>;

export const SnoozeWarrantyResponseSchema = z.object({
  warrantyId: z.string().uuid(),
  snoozedUntil: z.string().datetime(),
  status: z.enum(["published", "skipped"]),
});

export type SnoozeWarrantyResponse = z.infer<typeof SnoozeWarrantyResponseSchema>;
