#!/usr/bin/env tsx
/**
 * Seeds 50 listings with variants into memory (dev) or Postgres (future).
 * Today: runs catalog seed against in-memory repos for local smoke checks.
 */
import { createDefaultDeps } from "../src/lib/deps.js";

async function main() {
  const deps = await createDefaultDeps();
  const page = await deps.repos.listListings({ limit: 50 });
  console.log(`Seeded ${page.items.length} listings (first page).`);
  const first = page.items[0];
  if (first) {
    const variants = await deps.repos.findVariantsByListingId(first.id);
    console.log(`Example: "${first.title}" with ${variants.length} variant(s).`);
  }
}

void main();
