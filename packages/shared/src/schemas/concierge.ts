import { z } from "zod";
import { DispositionModeSchema, DispositionListingSchema } from "./disposition.js";
import {
  PhotoDumpBodySchema,
  PhotoDumpResponseSchema,
  UpdateWardrobeItemBodySchema,
  WardrobeItemSchema,
} from "./wardrobe.js";

/** Operator acts on behalf of a consented user (CONCIERGE-OPS). */
export const ConciergeUserParamsSchema = z.object({
  userId: z.string().uuid(),
});
export type ConciergeUserParams = z.infer<typeof ConciergeUserParamsSchema>;

export const ConciergePhotoDumpBodySchema = PhotoDumpBodySchema;
export type ConciergePhotoDumpBody = z.infer<typeof ConciergePhotoDumpBodySchema>;

export const ConciergePhotoDumpResponseSchema = PhotoDumpResponseSchema.extend({
  operatorId: z.string().uuid(),
  targetUserId: z.string().uuid(),
});
export type ConciergePhotoDumpResponse = z.infer<typeof ConciergePhotoDumpResponseSchema>;

export const ConciergeSortBodySchema = UpdateWardrobeItemBodySchema;
export type ConciergeSortBody = z.infer<typeof ConciergeSortBodySchema>;

export const ConciergeSortParamsSchema = ConciergeUserParamsSchema.extend({
  itemId: z.string().uuid(),
});
export type ConciergeSortParams = z.infer<typeof ConciergeSortParamsSchema>;

export const ConciergeSortResponseSchema = z.object({
  item: WardrobeItemSchema,
  operatorId: z.string().uuid(),
  targetUserId: z.string().uuid(),
});
export type ConciergeSortResponse = z.infer<typeof ConciergeSortResponseSchema>;

export const ConciergeListItemSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  mode: DispositionModeSchema.default("SELL"),
  priceMinor: z.number().int().nonnegative().optional().nullable(),
});

export const ConciergeListBodySchema = z.object({
  items: z.array(ConciergeListItemSchema).min(1).max(50),
});
export type ConciergeListBody = z.infer<typeof ConciergeListBodySchema>;

export const ConciergeListResponseSchema = z.object({
  listings: z.array(DispositionListingSchema),
  listed: z.number().int().nonnegative(),
  operatorId: z.string().uuid(),
  targetUserId: z.string().uuid(),
});
export type ConciergeListResponse = z.infer<typeof ConciergeListResponseSchema>;

export const ConciergeWardrobeResponseSchema = z.object({
  items: z.array(WardrobeItemSchema),
  operatorId: z.string().uuid(),
  targetUserId: z.string().uuid(),
});
export type ConciergeWardrobeResponse = z.infer<typeof ConciergeWardrobeResponseSchema>;

export const ConciergeErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});
