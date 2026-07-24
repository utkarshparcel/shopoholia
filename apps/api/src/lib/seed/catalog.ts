import { randomUUID } from "node:crypto";
import { buildSeedListings } from "@worn/shared";
import type { Repositories, ListingRecord, ListingVariantRecord } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";
import { seedScrapedCatalog } from "./scraped.js";

const PLACEHOLDER_JPEG = Buffer.from("worn-seed-image");

export type SeedCatalogOptions = {
  /** Prefer scraped product photos with real CDN URLs (default true for app boot). */
  preferScraped?: boolean;
  /** Cap scraped rows when preferScraped is on. */
  scrapedLimit?: number;
  env?: Record<string, string | undefined>;
};

/**
 * Seed listings. By default prefers the scraped catalog (real image URLs).
 * Pass preferScraped: false for deterministic synthetic fixtures (tests).
 */
export async function seedCatalog(
  repos: Repositories,
  storage: StorageClient,
  count = 50,
  options: SeedCatalogOptions = {},
): Promise<{ listings: ListingRecord[]; variants: ListingVariantRecord[] }> {
  const preferScraped = options.preferScraped !== false;
  if (preferScraped) {
    const scraped = await seedScrapedCatalog(repos, {
      limit: options.scrapedLimit ?? count,
      env: options.env,
    });
    if (scraped) return { listings: scraped.listings, variants: scraped.variants };
  }

  const seedData = buildSeedListings(count);
  const listings: ListingRecord[] = [];
  const variants: ListingVariantRecord[] = [];
  const now = new Date();

  for (let i = 0; i < seedData.length; i += 1) {
    const seed = seedData[i]!;
    const listingId = randomUUID();
    const houseModelRenderKey = `house-models/${listingId}.jpg`;

    await storage.put({
      key: houseModelRenderKey,
      body: PLACEHOLDER_JPEG,
      contentType: "image/jpeg",
    });

    const listing: ListingRecord = {
      id: listingId,
      sellerId: null,
      title: seed.title,
      category: seed.category,
      tags: seed.tags,
      coinPrice: seed.coinPrice,
      realPrice: seed.realPrice ?? null,
      productImageKeys: [houseModelRenderKey],
      houseModelRenderKey,
      affiliateUrl: seed.affiliateLinks?.[0]?.url ?? null,
      affiliateLinks: seed.affiliateLinks ?? null,
      status: "ACTIVE",
      sortOrder: i,
      createdAt: now,
    };
    listings.push(listing);

    for (const variantSeed of seed.variants) {
      const variantId = randomUUID();
      const garmentImageKey = `garments/${variantId}.jpg`;
      await storage.put({
        key: garmentImageKey,
        body: PLACEHOLDER_JPEG,
        contentType: "image/jpeg",
      });

      variants.push({
        id: variantId,
        listingId,
        size: variantSeed.size,
        color: variantSeed.color,
        garmentImageKey,
      });
    }
  }

  await repos.seedListings(listings, variants);
  return { listings, variants };
}
