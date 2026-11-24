import { z } from "zod";

export const BrandPriceWatchSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  brand: z.string().min(1),
  /** Baseline price in minor units (from wardrobe cost or user set). */
  watchedPriceMinor: z.number().int().nonnegative(),
  /** Notify when drop ≥ this percent (default 10). */
  thresholdPct: z.number().min(0).max(100),
  lastSeenPriceMinor: z.number().int().nonnegative().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CreateBrandPriceWatchBodySchema = z.object({
  brand: z.string().min(1).max(120),
  watchedPriceMinor: z.number().int().nonnegative(),
  thresholdPct: z.number().min(0).max(100).optional(),
});

export const BrandPriceWatchListResponseSchema = z.object({
  watches: z.array(BrandPriceWatchSchema),
});

export const PriceDropHitSchema = z.object({
  watchId: z.uuid(),
  brand: z.string(),
  listingId: z.uuid(),
  listingTitle: z.string(),
  watchedPriceMinor: z.number().int().nonnegative(),
  currentPriceMinor: z.number().int().nonnegative(),
  dropPct: z.number(),
  thresholdPct: z.number(),
  notified: z.boolean(),
});

export const PriceDropScanResponseSchema = z.object({
  hits: z.array(PriceDropHitSchema),
  scannedListings: z.number().int().nonnegative(),
});

export type BrandPriceWatch = z.infer<typeof BrandPriceWatchSchema>;
export type CreateBrandPriceWatchBody = z.infer<typeof CreateBrandPriceWatchBodySchema>;
export type BrandPriceWatchListResponse = z.infer<typeof BrandPriceWatchListResponseSchema>;
export type PriceDropHit = z.infer<typeof PriceDropHitSchema>;
export type PriceDropScanResponse = z.infer<typeof PriceDropScanResponseSchema>;
