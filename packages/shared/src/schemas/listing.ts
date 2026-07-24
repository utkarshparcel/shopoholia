import { z } from "zod";

export const AffiliateLinkSchema = z.object({
  url: z.string().url(),
  label: z.string(),
  platform: z.enum(["flipkart", "amazon", "myntra", "ajio", "nykaa", "other"]),
});

export const ListingCardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  coinPrice: z.number().int().nonnegative(),
  realPrice: z.string().nullable().optional(),
  houseModelImageUrl: z.string().url(),
  sellerId: z.string().uuid().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  affiliateUrl: z.string().url().nullable().optional(),
  affiliateLinks: z.array(AffiliateLinkSchema).nullable().optional(),
});

export type AffiliateLink = z.infer<typeof AffiliateLinkSchema>;

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
