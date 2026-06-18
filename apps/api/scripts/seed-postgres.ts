#!/usr/bin/env tsx
/**
 * Seeds 50 listings with variants into Postgres via Drizzle.
 * Requires DATABASE_URL and applied migrations.
 */
import { randomUUID } from "node:crypto";
import { buildSeedListings } from "@worn/shared";
import { createDb } from "@worn/db";
import { createPostgresRepositories } from "../src/lib/repositories/postgres.js";
import type { ListingRecord, ListingVariantRecord } from "../src/lib/repositories/types.js";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = createDb(databaseUrl);
  const repos = createPostgresRepositories(db);
  const existing = await repos.listListings({ limit: 1 });
  if (existing.items.length > 0) {
    console.log("Catalog already has listings; skipping seed.");
    return;
  }

  const seedData = buildSeedListings(50);
  const listings: ListingRecord[] = [];
  const variants: ListingVariantRecord[] = [];
  const now = new Date();

  for (let i = 0; i < seedData.length; i += 1) {
    const seed = seedData[i]!;
    const listingId = randomUUID();
    const houseModelRenderKey = `house-models/${listingId}.jpg`;

    listings.push({
      id: listingId,
      sellerId: null,
      title: seed.title,
      category: seed.category,
      tags: seed.tags,
      coinPrice: seed.coinPrice,
      productImageKeys: [houseModelRenderKey],
      houseModelRenderKey,
      affiliateUrl: null,
      status: "ACTIVE",
      sortOrder: i,
      createdAt: now,
    });

    for (const variantSeed of seed.variants) {
      const variantId = randomUUID();
      variants.push({
        id: variantId,
        listingId,
        size: variantSeed.size,
        color: variantSeed.color,
        garmentImageKey: `garments/${variantId}.jpg`,
      });
    }
  }

  await repos.seedListings(listings, variants);
  const page = await repos.listListings({ limit: 50 });
  console.log(`Seeded ${page.items.length} listings into Postgres.`);
}

void main();
