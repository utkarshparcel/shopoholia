import { z } from "zod";

export const DispositionModeSchema = z.enum(["SELL", "DONATE", "BARTER"]);
export type DispositionMode = z.infer<typeof DispositionModeSchema>;

export const DispositionStatusSchema = z.enum(["ACTIVE", "SOLD", "DONATED", "BARTERED", "CANCELLED"]);
export type DispositionStatus = z.infer<typeof DispositionStatusSchema>;

export const DispositionListingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  wardrobeItemId: z.string().uuid(),
  mode: DispositionModeSchema,
  priceMinor: z.number().int().nullable(),
  status: DispositionStatusSchema,
  sellerId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DispositionListing = z.infer<typeof DispositionListingSchema>;

export const CreateDispositionBodySchema = z.object({
  wardrobeItemId: z.string().uuid(),
  mode: DispositionModeSchema.default("SELL"),
  priceMinor: z.number().int().nonnegative().optional().nullable(),
  /** BARTER only: create an INDIVIDUAL seller and set disposition_listings.sellerId. */
  createSeller: z.boolean().optional(),
});
export type CreateDispositionBody = z.infer<typeof CreateDispositionBodySchema>;

export const DeclutterChallengeSchema = z.object({
  eligible: z.boolean(),
  started: z.boolean(),
  progress: z.number().int().nonnegative(),
  target: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  completed: z.boolean(),
  label: z.string(),
});
export type DeclutterChallenge = z.infer<typeof DeclutterChallengeSchema>;

export const DeclutterShareCardSchema = z.object({
  progress: z.number().int().nonnegative(),
  target: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  completed: z.boolean(),
  watermark: z.string().min(1),
  headline: z.string().min(1),
  modeLine: z.string().nullable(),
  shareText: z.string().min(1),
});
export type DeclutterShareCardResponse = z.infer<typeof DeclutterShareCardSchema>;

export const DispositionListResponseSchema = z.object({
  listings: z.array(DispositionListingSchema),
  /** Sell/donate N items challenge (N54-DECLUTTER-CHALLENGE). */
  declutterChallenge: DeclutterChallengeSchema.optional(),
  declutterShareCard: DeclutterShareCardSchema.optional(),
});
export type DispositionListResponse = z.infer<typeof DispositionListResponseSchema>;

export const DispositionCreateResponseSchema = DispositionListingSchema;
export type DispositionCreateResponse = z.infer<typeof DispositionCreateResponseSchema>;

export const DeclutterChallengeStartBodySchema = z.object({
  target: z.number().int().positive().max(50).optional(),
});
export type DeclutterChallengeStartBody = z.infer<typeof DeclutterChallengeStartBodySchema>;

export const DeclutterChallengeStartResponseSchema = z.object({
  declutterChallenge: DeclutterChallengeSchema,
  declutterShareCard: DeclutterShareCardSchema,
  pushQueued: z.boolean().optional().default(false),
});
export type DeclutterChallengeStartResponse = z.infer<typeof DeclutterChallengeStartResponseSchema>;

/** DISP-LOGISTICS — pricing suggestion + pickup partner stub. */
export const DispositionPriceSuggestSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  suggestedPriceMinor: z.number().int().nonnegative(),
  floorMinor: z.number().int().nonnegative(),
  ceilingMinor: z.number().int().nonnegative(),
  depreciationPct: z.number(),
  ageYears: z.number(),
  rationale: z.string().min(1),
});
export type DispositionPriceSuggest = z.infer<typeof DispositionPriceSuggestSchema>;

export const LogisticsPartnerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modes: z.array(DispositionModeSchema),
  metro: z.string().min(1),
  etaHours: z.number().int().positive(),
  stub: z.literal(true),
});
export type LogisticsPartner = z.infer<typeof LogisticsPartnerSchema>;

export const LogisticsPartnersResponseSchema = z.object({
  partners: z.array(LogisticsPartnerSchema),
});
export type LogisticsPartnersResponse = z.infer<typeof LogisticsPartnersResponseSchema>;

export const BookDispositionPickupBodySchema = z.object({
  partnerId: z.string().min(1),
  pickupSlotAt: z.string().datetime(),
});
export type BookDispositionPickupBody = z.infer<typeof BookDispositionPickupBodySchema>;

export const DispositionPickupBookingSchema = z.object({
  dispositionId: z.string().uuid(),
  partnerId: z.string().min(1),
  partnerName: z.string().min(1),
  pickupSlotAt: z.string().datetime(),
  bookedAt: z.string().datetime(),
  stub: z.literal(true),
  etaHours: z.number().int().positive(),
});
export type DispositionPickupBooking = z.infer<typeof DispositionPickupBookingSchema>;
