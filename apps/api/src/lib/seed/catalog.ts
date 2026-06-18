import { randomUUID } from "node:crypto";
import { buildSeedListings } from "@worn/shared";
import type { Repositories, ListingRecord, ListingVariantRecord } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";

const PLACEHOLDER_JPEG = Buffer.from("worn-seed-image");

export async function seedCatalog(
  repos: Repositories,
  storage: StorageClient,
  count = 50,
): Promise<{ listings: ListingRecord[]; variants: ListingVariantRecord[] }> {
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
      productImageKeys: [houseModelRenderKey],
      houseModelRenderKey,
      affiliateUrl: `https://affiliate.worn.example/items/${listingId}`,
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
