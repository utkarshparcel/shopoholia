import { z } from "zod";

export const ListingCardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  coinPrice: z.number().int().nonnegative(),
  houseModelImageUrl: z.string().url(),
  sellerId: z.string().uuid().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  affiliateUrl: z.string().url().nullable().optional(),
});

export const FeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  seller_id: z.string().uuid().optional(),
});

export const FeedResponseSchema = z.object({
  items: z.array(ListingCardSchema),
  nextCursor: z.string().nullable(),
});

export const ListingVariantSchema = z.object({
  id: z.string().uuid(),
  size: z.string(),
  color: z.string(),
  garmentImageUrl: z.string().url(),
});

export const ListingDetailSchema = ListingCardSchema.extend({
  tags: z.array(z.string()),
  variants: z.array(ListingVariantSchema),
});

export const ListingParamsSchema = z.object({
  id: z.string().uuid(),
});

export const TryonRequestSchema = z.object({
  variantId: z.string().uuid(),
});

export const TryonResponseSchema = z.object({
  status: z.enum(["READY", "PROCESSING"]),
  previewUrl: z.string().url().nullable(),
});

export type ListingCard = z.infer<typeof ListingCardSchema>;
export type FeedResponse = z.infer<typeof FeedResponseSchema>;
export type ListingDetail = z.infer<typeof ListingDetailSchema>;
export type TryonRequest = z.infer<typeof TryonRequestSchema>;
export type TryonResponse = z.infer<typeof TryonResponseSchema>;
