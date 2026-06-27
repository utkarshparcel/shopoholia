#!/usr/bin/env tsx
/**
 * LEGAL DISCLAIMER — INTERNAL CATALOG SCRAPER (R&D / DATASET BUILD)
 *
 * Paginates newme.asia/shop and fetches product pages at 2s intervals.
 * Bulk scraping may violate Newme Terms of Service. Prefer a licensed seller feed
 * or partnership export for production. Not legal advice — obtain counsel first.
 *
 * Usage:
 *   pnpm --filter @worn/api scrape-newme
 *   pnpm --filter @worn/api scrape-newme -- --limit 20
 *   pnpm --filter @worn/api scrape-newme -- --dry-run --limit 10
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CATALOG_DIR,
  INTER_REQUEST_DELAY_MS,
  appendJsonl,
  ensureCatalogDir,
  extractNewmeProduct,
  fetchPage,
  findNewmeProductLinks,
  loadCheckpoint,
  mergeFields,
  parseJsonLdProduct,
  parseOgTags,
  parseNewmeTotalPages,
  saveCheckpoint,
  sleep,
  toCatalogRow,
} from "./lib/catalog-scrape.js";

const SHOP_BASE = "https://newme.asia/shop";
const OUTPUT_PATH = join(CATALOG_DIR, "newme.jsonl");
const CHECKPOINT_PATH = join(CATALOG_DIR, "newme.checkpoint.json");

type Options = {
  limit?: number;
  dryRun: boolean;
  startPage: number;
  maxPages?: number;
};

function parseArgs(argv: string[]): Options {
  let limit: number | undefined;
  let dryRun = false;
  let startPage = 1;
  let maxPages: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--start-page") startPage = Number(argv[++i]);
    else if (arg === "--max-pages") maxPages = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(`scrape-newme — fetch Newme shop catalog to JSONL

Options:
  --limit <n>        Stop after n new products (for validation)
  --dry-run          Parse pages but do not write JSONL/checkpoint
  --start-page <n>   First shop page (default: 1)
  --max-pages <n>    Cap pagination (default: auto-detect ~270)
`);
      process.exit(0);
    }
  }

  return { limit, dryRun, startPage, maxPages };
}

async function scrapeProductPage(url: string): Promise<ReturnType<typeof toCatalogRow>> {
  const { html } = await fetchPage(url);
  const base = extractNewmeProduct(html, url);
  const extra = mergeFields(parseJsonLdProduct(html), parseOgTags(html));
  const image_urls = [
    ...new Set([...(base.image_urls ?? []), ...(extra.images ?? [])]),
  ];
  return toCatalogRow(
    {
      ...base,
      title: base.title ?? extra.title,
      image_urls,
      affiliate_url: url,
      source: "newme",
    },
    "newme",
    url,
  );
}

export async function runNewmeCatalogScraper(options: Options): Promise<{
  written: number;
  skipped: number;
  pagesScanned: number;
  outputPath: string;
}> {
  await ensureCatalogDir();
  const checkpoint = await loadCheckpoint(CHECKPOINT_PATH);
  const scrapedSet = new Set(checkpoint.scrapedUrls);
  const completedPages = new Set(checkpoint.completedPages);

  let written = 0;
  let skipped = 0;
  let pagesScanned = 0;
  let totalPages = options.maxPages ?? 270;

  const firstPageUrl =
    options.startPage <= 1 ? SHOP_BASE : `${SHOP_BASE}?page=${options.startPage}`;
  const first = await fetchPage(firstPageUrl);
  totalPages = options.maxPages ?? parseNewmeTotalPages(first.html);
  console.log(`Newme shop: detected ~${totalPages} pages`);

  for (let page = options.startPage; page <= totalPages; page += 1) {
    if (options.limit !== undefined && written >= options.limit) break;
    if (completedPages.has(page)) {
      console.log(`Page ${page}: skipped (checkpoint)`);
      continue;
    }

    const pageUrl =
      page <= 1 ? SHOP_BASE : page === options.startPage ? firstPageUrl : `${SHOP_BASE}?page=${page}`;
    const { html } = page === options.startPage ? first : await fetchPage(pageUrl);
    const productUrls = findNewmeProductLinks(html);
    pagesScanned += 1;
    console.log(`Page ${page}/${totalPages}: ${productUrls.length} product link(s)`);

    for (const productUrl of productUrls) {
      if (options.limit !== undefined && written >= options.limit) break;
      if (scrapedSet.has(productUrl)) {
        skipped += 1;
        continue;
      }

      await sleep(INTER_REQUEST_DELAY_MS);
      try {
        const row = await scrapeProductPage(productUrl);
        if (!row) {
          console.warn(`  skip (incomplete): ${productUrl}`);
          skipped += 1;
          continue;
        }
        if (!options.dryRun) {
          await appendJsonl(OUTPUT_PATH, row);
          scrapedSet.add(productUrl);
          checkpoint.scrapedUrls = [...scrapedSet];
          await saveCheckpoint(CHECKPOINT_PATH, checkpoint);
        }
        written += 1;
        console.log(`  + ${row.title.slice(0, 60)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  error: ${productUrl} — ${message}`);
        skipped += 1;
      }
    }

    completedPages.add(page);
    checkpoint.completedPages = [...completedPages];
    if (!options.dryRun) await saveCheckpoint(CHECKPOINT_PATH, checkpoint);

    if (page < totalPages) await sleep(INTER_REQUEST_DELAY_MS);
  }

  return { written, skipped, pagesScanned, outputPath: OUTPUT_PATH };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log("LEGAL: Internal R&D scraper — not for production without legal review.\n");

  if (options.dryRun && options.limit === undefined) {
    options.limit = 10;
    console.log("Dry run: defaulting --limit 10");
  }

  const result = await runNewmeCatalogScraper(options);
  console.log(
    `\nDone. wrote=${result.written} skipped=${result.skipped} pages=${result.pagesScanned} dryRun=${options.dryRun}`,
  );
  if (!options.dryRun) {
    console.log(`Output: ${result.outputPath}`);
    console.log(`Checkpoint: ${CHECKPOINT_PATH}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch(async (error: unknown) => {
    console.error(error);
    await writeFile(
      join(CATALOG_DIR, "newme-scrape-error.json"),
      `${JSON.stringify({ error: String(error), at: new Date().toISOString() }, null, 2)}\n`,
    ).catch(() => undefined);
    process.exit(1);
  });
}
