import { z } from "zod";
import { ListingCardSchema } from "./listing.js";

export const LookbookParamsSchema = z.object({
  listingId: z.string().uuid(),
});

/** The signed-in user's saved listings, most recently saved first. */
export const LookbookResponseSchema = z.object({
  items: z.array(ListingCardSchema),
});

export type LookbookParams = z.infer<typeof LookbookParamsSchema>;
export type LookbookResponse = z.infer<typeof LookbookResponseSchema>;
