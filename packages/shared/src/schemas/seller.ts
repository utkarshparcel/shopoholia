import { z } from "zod";
import { ListingCardSchema } from "./listing.js";

export const SellerRegisterBodySchema = z.object({
  shopName: z.string().min(2).max(60),
});

export const SellerRegisterResponseSchema = z.object({
  id: z.uuid(),
  shopName: z.string(),
});

export const SellerListingCreateResponseSchema = z.object({
  listingId: z.uuid(),
  variantId: z.uuid(),
});

export const SellerListingsResponseSchema = z.object({
  items: z.array(ListingCardSchema),
});

export type SellerRegisterBody = z.infer<typeof SellerRegisterBodySchema>;
export type SellerRegisterResponse = z.infer<typeof SellerRegisterResponseSchema>;
export type SellerListingCreateResponse = z.infer<typeof SellerListingCreateResponseSchema>;
export type SellerListingsResponse = z.infer<typeof SellerListingsResponseSchema>;
