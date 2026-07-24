import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  ListingRecord,
  ListingVariantRecord,
  Repositories,
} from "../repositories/types.js";

const CatalogSourceSchema = z.enum(["shein", "newme", "amazon", "flipkart", "synthetic"]);

const CatalogImportRowSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  image_urls: z.array(z.string().url()).min(1),
  affiliate_url: z.string().url(),
  source: CatalogSourceSchema,
  coin_price: z.number().int().positive().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
});

export type CatalogImportRow = z.infer<typeof CatalogImportRowSchema>;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BUNDLED_SCRAPED_CATALOG_PATH = join(__dirname, "scraped-catalog.jsonl");

/** Prefer real product photos; skip synthetic/picsum padding. */
export function isRealProductImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/picsum\.photos/i.test(url)) return false;
  if (/r2\.mock\.worn\.test/i.test(url)) return false;
  return true;
}

export function parseCatalogJsonl(content: string): CatalogImportRow[] {
  const rows: CatalogImportRow[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(CatalogImportRowSchema.parse(JSON.parse(trimmed) as unknown));
  }
  return rows;
}

export function filterRealCatalogRows(rows: CatalogImportRow[]): CatalogImportRow[] {
  return rows.filter(
    (row) => row.source !== "synthetic" && isRealProductImageUrl(row.image_urls[0] ?? ""),
  );
}

function defaultCoinPrice(row: CatalogImportRow, index: number): number {
  if (row.coin_price) return row.coin_price;
  const base =
    row.source === "shein"
      ? 26
      : row.source === "newme"
        ? 30
        : row.source === "synthetic"
          ? 24
          : 28;
  return base + (index % 12) * 2;
}

function inferRealPrice(coinPrice: number): string {
  const rupees = Math.max(999, coinPrice * 18);
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function mapScrapedRowToRecords(
  row: CatalogImportRow,
  index: number,
  sortOrder: number,
): { listing: ListingRecord; variant: ListingVariantRecord } {
  const listingId = randomUUID();
  const variantId = randomUUID();
  const now = new Date();
  const imageUrl = row.image_urls[0]!;
  const coinPrice = defaultCoinPrice(row, index);

  const listing: ListingRecord = {
    id: listingId,
    sellerId: null,
    title: row.title,
    category: row.category,
    tags: [`src:${row.source}`, ...row.tags],
    coinPrice,
    realPrice: inferRealPrice(coinPrice),
    productImageKeys: [...row.image_urls],
    houseModelRenderKey: imageUrl,
    affiliateUrl: row.affiliate_url,
    affiliateLinks: [
      {
        url: row.affiliate_url,
        label: row.source,
        platform:
          row.source === "amazon" || row.source === "flipkart" ? row.source : "other",
      },
    ],
    status: "ACTIVE",
    sortOrder,
    createdAt: now,
  };

  const variant: ListingVariantRecord = {
    id: variantId,
    listingId,
    size: row.size ?? "M",
    color: row.color ?? "Default",
    garmentImageKey: imageUrl,
  };

  return { listing, variant };
}

export function candidateCatalogPaths(
  env: Record<string, string | undefined> = process.env,
): string[] {
  // apps/api/src/lib/seed → repo root
  const repoRoot = join(__dirname, "../../../../../");
  const paths: string[] = [];
  if (env.CATALOG_SEED_FILE) paths.push(env.CATALOG_SEED_FILE);
  paths.push(
    join(repoRoot, "tmp/catalog/newme.jsonl"),
    BUNDLED_SCRAPED_CATALOG_PATH,
    join(repoRoot, "tmp/catalog/merged-10k.jsonl"),
    join(repoRoot, "tmp/catalog/merged-100k.jsonl"),
  );
  return paths;
}

export async function loadScrapedCatalogRows(
  env: Record<string, string | undefined> = process.env,
  limit?: number,
): Promise<{ rows: CatalogImportRow[]; path: string } | null> {
  for (const path of candidateCatalogPaths(env)) {
    if (!existsSync(path)) continue;
    const content = await readFile(path, "utf8");
    const real = filterRealCatalogRows(parseCatalogJsonl(content));
    if (real.length === 0) continue;
    const rows = typeof limit === "number" ? real.slice(0, limit) : real;
    return { rows, path };
  }
  return null;
}

export async function seedScrapedCatalog(
  repos: Repositories,
  options: { limit?: number; env?: Record<string, string | undefined> } = {},
): Promise<{ listings: ListingRecord[]; variants: ListingVariantRecord[]; path: string } | null> {
  const loaded = await loadScrapedCatalogRows(options.env, options.limit);
  if (!loaded) return null;

  const listings: ListingRecord[] = [];
  const variants: ListingVariantRecord[] = [];

  loaded.rows.forEach((row, index) => {
    const mapped = mapScrapedRowToRecords(row, index, index);
    listings.push(mapped.listing);
    variants.push(mapped.variant);
  });

  await repos.seedListings(listings, variants);
  return { listings, variants, path: loaded.path };
}
