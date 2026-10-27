import { z } from "zod";

export const RecipientRelationshipSchema = z.enum(["FAMILY", "FRIEND", "PARTNER", "COLLEAGUE", "OTHER"]);
export type RecipientRelationship = z.infer<typeof RecipientRelationshipSchema>;

export const GiftOccasionSchema = z.enum(["BIRTHDAY", "ANNIVERSARY", "FESTIVAL", "HOUSEWARMING", "GRADUATION", "OTHER"]);
export type GiftOccasion = z.infer<typeof GiftOccasionSchema>;

export const GiftOrderStatusSchema = z.enum(["PLANNED", "ORDERED", "DELIVERED", "CANCELLED"]);
export type GiftOrderStatus = z.infer<typeof GiftOrderStatusSchema>;

export const ImportantDateSchema = z.object({
  occasion: z.string().min(1),
  date: z.string().datetime(),
  label: z.string().optional(),
});
export type ImportantDate = z.infer<typeof ImportantDateSchema>;

/** Wishlist ref: listing id, URL, or free-text title. */
export const WishlistRefSchema = z.object({
  listingId: z.string().uuid().nullable().optional().default(null),
  title: z.string().min(1).max(200),
  url: z.string().url().nullable().optional().default(null),
  note: z.string().max(500).nullable().optional().default(null),
});
export type WishlistRef = z.infer<typeof WishlistRefSchema>;

/** Accept structured refs or legacy plain strings (normalized to { title }). */
export const WishlistItemInputSchema = z.preprocess((v) => {
  if (typeof v === "string") return { title: v, listingId: null, url: null, note: null };
  return v;
}, WishlistRefSchema);
export type WishlistItemInput = z.infer<typeof WishlistRefSchema>;

export function normalizeWishlist(items: unknown): WishlistRef[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const parsed = WishlistItemInputSchema.safeParse(item);
      return parsed.success ? parsed.data : null;
    })
    .filter((x): x is WishlistRef => x != null);
}

export const RecipientProfileSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().uuid(),
  sizes: z.record(z.string()),
  tasteTags: z.array(z.string()),
  wishlist: z.array(WishlistRefSchema),
  importantDates: z.array(ImportantDateSchema),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RecipientProfile = z.infer<typeof RecipientProfileSchema>;

export const RecipientSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  relationship: RecipientRelationshipSchema,
  region: z.string().min(1),
  profile: RecipientProfileSchema.nullable().optional(),
  /** Soonest upcoming occasion from profile.importantDates (ISO). */
  nextOccasionDate: z.string().datetime().nullable().optional(),
  nextOccasionLabel: z.string().nullable().optional(),
  /** Whole days until nextOccasionDate (0 = today). */
  daysUntil: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Recipient = z.infer<typeof RecipientSchema>;

export const FestivalSeedSchema = z.object({
  occasion: z.string().min(1),
  date: z.string().datetime(),
  label: z.string().min(1),
});
export type FestivalSeed = z.infer<typeof FestivalSeedSchema>;

export const FestivalsResponseSchema = z.object({
  region: z.string(),
  festivals: z.array(FestivalSeedSchema),
});
export type FestivalsResponse = z.infer<typeof FestivalsResponseSchema>;

export const CreateRecipientBodySchema = z.object({
  name: z.string().min(1).max(120),
  relationship: RecipientRelationshipSchema.optional().default("OTHER"),
  region: z.string().optional().default("IN"),
  profile: z
    .object({
      sizes: z.record(z.string()).optional().default({}),
      tasteTags: z.array(z.string()).optional().default([]),
      wishlist: z.array(WishlistItemInputSchema).optional().default([]),
      importantDates: z.array(ImportantDateSchema).optional().default([]),
      notes: z.string().optional().nullable(),
    })
    .optional(),
});
export type CreateRecipientBody = z.infer<typeof CreateRecipientBodySchema>;

export const UpdateWishlistBodySchema = z.object({
  wishlist: z.array(WishlistItemInputSchema),
});
export type UpdateWishlistBody = z.infer<typeof UpdateWishlistBodySchema>;

export const RecipientsResponseSchema = z.object({
  recipients: z.array(RecipientSchema),
});
export type RecipientsResponse = z.infer<typeof RecipientsResponseSchema>;

export const RecipientIdeasResponseSchema = z.object({
  recipientId: z.string().uuid(),
  /** Coin budget cap applied to ranking (null = no cap). */
  budgetCap: z.number().int().nonnegative().nullable().optional(),
  ideas: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      category: z.string(),
      coinPrice: z.number().int(),
      affiliateUrl: z.string().nullable(),
      reason: z.string(),
      score: z.number().optional(),
    }),
  ),
});
export type RecipientIdeasResponse = z.infer<typeof RecipientIdeasResponseSchema>;

export const CreateGiftOrderBodySchema = z.object({
  recipientId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  occasion: GiftOccasionSchema.optional(),
  affiliateLink: z.string().url().optional().nullable(),
  wrapMessage: z.string().max(1000).optional().nullable(),
  groupTargetMinor: z.number().int().positive().optional().nullable(),
  groupCurrency: z.string().min(1).max(8).optional().nullable(),
});
export type CreateGiftOrderBody = z.infer<typeof CreateGiftOrderBodySchema>;

export const GiftOrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  recipientId: z.string().uuid(),
  listingId: z.string().uuid().nullable(),
  occasion: GiftOccasionSchema.nullable(),
  status: GiftOrderStatusSchema,
  affiliateLink: z.string().nullable(),
  wrapMessage: z.string().nullable(),
  groupTargetMinor: z.number().int().nullable(),
  groupCurrency: z.string().nullable(),
  contributedMinor: z.number().int().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GiftOrder = z.infer<typeof GiftOrderSchema>;

export const GiftOrderResponseSchema = GiftOrderSchema;
export type GiftOrderResponse = z.infer<typeof GiftOrderResponseSchema>;

export const CreateGroupContributeBodySchema = z.object({
  amountMinor: z.number().int().positive(),
  note: z.string().max(500).optional().nullable(),
  contributorName: z.string().max(120).optional().nullable(),
});
export type CreateGroupContributeBody = z.infer<typeof CreateGroupContributeBodySchema>;

export const GroupGiftContributionSchema = z.object({
  id: z.string().uuid(),
  giftOrderId: z.string().uuid(),
  contributorUserId: z.string().uuid().nullable(),
  contributorName: z.string().nullable(),
  amountMinor: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GroupGiftContribution = z.infer<typeof GroupGiftContributionSchema>;

export const GroupContributeResponseSchema = z.object({
  contribution: GroupGiftContributionSchema,
  gift: GiftOrderSchema,
});
export type GroupContributeResponse = z.infer<typeof GroupContributeResponseSchema>;
