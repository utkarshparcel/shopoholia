#!/usr/bin/env tsx
/**
 * Import external fashion catalog rows (JSONL or CSV) into WORN listings.
 *
 * Usage:
 *   pnpm --filter @worn/api import-catalog -- --file scripts/sample-catalog.jsonl --dry-run
 *   pnpm --filter @worn/api import-catalog -- --file /path/to/shein-100k.jsonl --limit 1000
 *
 * Requires DATABASE_URL for Postgres; without it, inserts into in-memory repos (dev only).
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { z } from "zod";
import { createMemoryRepositories } from "../src/lib/repositories/memory.js";
import { createPostgresRepositoriesFromUrl } from "../src/lib/repositories/postgres.js";
import type {
  ListingRecord,
  ListingVariantRecord,
  Repositories,
} from "../src/lib/repositories/types.js";

const CatalogSourceSchema = z.enum(["shein", "newme"]);

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

type ImportOptions = {
  file: string;
  dryRun: boolean;
  limit?: number;
  startSortOrder: number;
};

function parseArgs(argv: string[]): ImportOptions {
  let file = "scripts/sample-catalog.jsonl";
  let dryRun = false;
  let limit: number | undefined;
  let startSortOrder = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--file") file = argv[++i] ?? file;
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--start-sort-order") startSortOrder = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(`import-catalog — load JSONL/CSV catalog into WORN

Options:
  --file <path>            Input file (default: scripts/sample-catalog.jsonl)
  --dry-run                Parse and validate only; do not insert
  --limit <n>              Import at most n rows
  --start-sort-order <n>   Initial sortOrder for feed ranking (default: 0)
`);
      process.exit(0);
    }
  }

  return { file, dryRun, limit, startSortOrder };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function stableId(source: string, title: string, affiliateUrl: string): string {
  const digest = createHash("sha256").update(`${source}:${title}:${affiliateUrl}`).digest("hex");
  return digest.slice(0, 32);
}

function defaultCoinPrice(row: CatalogImportRow, index: number): number {
  if (row.coin_price) return row.coin_price;
  const base = row.source === "shein" ? 26 : 30;
  return base + (index % 12) * 2;
}

function parseJsonl(content: string): unknown[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(content: string): unknown[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });

    const tags = row.tags ? row.tags.split("|").map((t) => t.trim()).filter(Boolean) : [];
    const imageUrls = row.image_urls
      ? row.image_urls.split("|").map((u) => u.trim()).filter(Boolean)
      : [];

    return {
      title: row.title,
      category: row.category,
      tags,
      image_urls: imageUrls,
      affiliate_url: row.affiliate_url,
      source: row.source,
      coin_price: row.coin_price ? Number(row.coin_price) : undefined,
      size: row.size || undefined,
      color: row.color || undefined,
    };
  });
}

export function parseCatalogFile(content: string, filename: string): CatalogImportRow[] {
  const ext = extname(filename).toLowerCase();
  const rawRows = ext === ".csv" ? parseCsv(content) : parseJsonl(content);
  return rawRows.map((row, index) => CatalogImportRowSchema.parse(row, { path: [String(index)] }));
}

export function mapRowToRecords(
  row: CatalogImportRow,
  index: number,
  sortOrder: number,
): { listing: ListingRecord; variant: ListingVariantRecord } {
  const listingId = randomUUID();
  const variantId = randomUUID();
  const slug = slugify(row.title);
  const keyBase = `catalog/${row.source}/${stableId(row.source, row.title, row.affiliate_url)}/${slug}`;
  const now = new Date();

  const listing: ListingRecord = {
    id: listingId,
    sellerId: null,
    title: row.title,
    category: row.category,
    tags: [`src:${row.source}`, ...row.tags],
    coinPrice: defaultCoinPrice(row, index),
    productImageKeys: row.image_urls.map((_, i) => `${keyBase}/product-${i}.jpg`),
    houseModelRenderKey: `${keyBase}/house-model.jpg`,
    affiliateUrl: row.affiliate_url,
    status: "ACTIVE",
    sortOrder,
    createdAt: now,
  };

  const variant: ListingVariantRecord = {
    id: variantId,
    listingId,
    size: row.size ?? "M",
    color: row.color ?? "Default",
    garmentImageKey: `${keyBase}/garment.jpg`,
  };

  return { listing, variant };
}

function createRepositories(): Repositories {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return createPostgresRepositoriesFromUrl(databaseUrl);
  }
  return createMemoryRepositories();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = await readFile(options.file, "utf8");
  const rows = parseCatalogFile(content, basename(options.file));
  const slice = options.limit ? rows.slice(0, options.limit) : rows;

  const listings: ListingRecord[] = [];
  const variants: ListingVariantRecord[] = [];

  slice.forEach((row, index) => {
    const mapped = mapRowToRecords(row, index, options.startSortOrder + index);
    listings.push(mapped.listing);
    variants.push(mapped.variant);
  });

  const bySource = slice.reduce<Record<string, number>>((acc, row) => {
    acc[row.source] = (acc[row.source] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Parsed ${slice.length} row(s) from ${options.file}`);
  console.log(`By source: ${JSON.stringify(bySource)}`);

  if (options.dryRun) {
    console.log("Dry run — no database writes.");
    console.log("Example listing:", JSON.stringify(listings[0], null, 2));
    return;
  }

  const repos = createRepositories();
  await repos.seedListings(listings, variants);
  console.log(`Inserted ${listings.length} listing(s) and ${variants.length} variant(s).`);
  console.log(
    "Note: image keys are placeholders. Mirror image_urls to R2 at those keys before serving feed images.",
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
