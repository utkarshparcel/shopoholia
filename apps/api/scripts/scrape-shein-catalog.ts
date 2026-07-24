#!/usr/bin/env tsx
/**
 * LEGAL DISCLAIMER — INTERNAL CATALOG SCRAPER (R&D / DATASET BUILD)
 *
 * Attempts Shein category/search crawl via Playwright with 2s rate limits.
 * Shein blocks naive fetch (403). Production scale requires Bright Data (~$250/100k)
 * or residential proxies. Bulk scraping violates Shein ToS. Not legal advice.
 *
 * Usage:
 *   pnpm --filter @worn/api scrape-shein -- --limit 100
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CATALOG_DIR,
  INTER_REQUEST_DELAY_MS,
  appendJsonl,
  ensureCatalogDir,
  extractSheinProduct,
  findSheinProductLinks,
  isBlockedHtml,
  loadCheckpoint,
  mergeFields,
  parseJsonLdProduct,
  parseOgTags,
  saveCheckpoint,
  sheinFetchHeaders,
  sleep,
  toCatalogRow,
  withPlaywright,
} from "./lib/catalog-scrape.js";
import { fetchPage } from "./scrape-probes/probe-runner.js";

const OUTPUT_PATH = join(CATALOG_DIR, "shein.jsonl");
const CHECKPOINT_PATH = join(CATALOG_DIR, "shein.checkpoint.json");
const REPORT_PATH = join(CATALOG_DIR, "shein-scrape-report.json");

const SEARCH_SEEDS = [
  "https://in.shein.com/pdsearch/women%20tops/",
  "https://in.shein.com/pdsearch/dresses/",
  "https://in.shein.com/pdsearch/jeans/",
  "https://in.shein.com/pdsearch/skirts/",
];

type Options = {
  limit: number;
  dryRun: boolean;
  maxPagesPerSeed: number;
};

function parseArgs(argv: string[]): Options {
  let limit = 100;
  let dryRun = false;
  let maxPagesPerSeed = 3;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--max-pages-per-seed") maxPagesPerSeed = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(`scrape-shein — Playwright Shein crawl attempt

Options:
  --limit <n>              Max products to scrape (default: 100)
  --max-pages-per-seed <n> Search pages per seed URL (default: 3)
  --dry-run                Do not write JSONL
`);
      process.exit(0);
    }
  }

  return { limit, dryRun, maxPagesPerSeed };
}

type FailureReport = {
  success: boolean;
  written: number;
  skipped: number;
  blocked: boolean;
  blockers: string[];
  recommendation: string;
  seedsAttempted: string[];
  error?: string;
  finishedAt: string;
};

async function fetchSheinListing(url: string): Promise<{ html: string; status: number; method: string }> {
  const fetchResult = await fetchPage(url, sheinFetchHeaders());
  if (!isBlockedHtml(fetchResult.html, fetchResult.status) && fetchResult.html.length > 2000) {
    return { html: fetchResult.html, status: fetchResult.status, method: "fetch" };
  }

  const pwHtml = await withPlaywright(async (page) => {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(3000);
    return { html: await page.content(), status: response?.status() ?? 0 };
  });
  return { html: pwHtml.html, status: pwHtml.status, method: "playwright" };
}

async function scrapeSheinProduct(url: string): Promise<ReturnType<typeof toCatalogRow>> {
  const { html, status } = await fetchSheinListing(url);
  if (isBlockedHtml(html, status)) return null;
  const base = extractSheinProduct(html, url);
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
      source: "shein",
    },
    "shein",
    url,
  );
}

export async function runSheinCatalogScraper(options: Options): Promise<FailureReport> {
  await ensureCatalogDir();
  const checkpoint = await loadCheckpoint(CHECKPOINT_PATH);
  const scrapedSet = new Set(checkpoint.scrapedUrls);
  const blockers: string[] = [];
  let written = 0;
  let skipped = 0;
  let blocked = false;
  let lastError: string | undefined;

  for (const seed of SEARCH_SEEDS) {
    if (written >= options.limit) break;

    for (let pageNum = 1; pageNum <= options.maxPagesPerSeed; pageNum += 1) {
      if (written >= options.limit) break;
      const listingUrl = pageNum === 1 ? seed : `${seed}?page=${pageNum}`;

      try {
        await sleep(INTER_REQUEST_DELAY_MS);
        const listing = await fetchSheinListing(listingUrl);
        console.log(`Seed ${seed} page ${pageNum}: method=${listing.method} status=${listing.status}`);

        if (isBlockedHtml(listing.html, listing.status)) {
          blocked = true;
          if (listing.status === 403) blockers.push("403");
          if (listing.html.toLowerCase().includes("cloudflare")) blockers.push("cloudflare");
          if (listing.html.toLowerCase().includes("captcha")) blockers.push("captcha");
          console.warn(`Blocked on ${listingUrl}`);
          break;
        }

        const productUrls = findSheinProductLinks(listing.html, listingUrl);
        console.log(`  found ${productUrls.length} product link(s)`);
        if (productUrls.length === 0) {
          blockers.push("empty-listing");
          break;
        }

        for (const productUrl of productUrls) {
          if (written >= options.limit) break;
          if (scrapedSet.has(productUrl)) {
            skipped += 1;
            continue;
          }

          await sleep(INTER_REQUEST_DELAY_MS);
          try {
            const row = await scrapeSheinProduct(productUrl);
            if (!row) {
              skipped += 1;
              blocked = true;
              blockers.push("incomplete-product");
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
            lastError = err instanceof Error ? err.message : String(err);
            skipped += 1;
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        blocked = true;
        blockers.push("exception");
        console.warn(`Failed seed page: ${listingUrl} — ${lastError}`);
        break;
      }
    }

    if (blocked && written === 0) break;
  }

  const uniqueBlockers = [...new Set(blockers)];
  const report: FailureReport = {
    success: written > 0 && !blocked,
    written,
    skipped,
    blocked: blocked || written === 0,
    blockers: uniqueBlockers,
    recommendation:
      written === 0
        ? "Shein scrape blocked. Use Bright Data Shein dataset (~$250 for 100k rows) or Apify with proxies."
        : written < options.limit
          ? "Partial success only — scale via licensed dataset, not DIY scrape."
          : "Feasible at small scale; 100k requires commercial dataset.",
    seedsAttempted: SEARCH_SEEDS,
    error: lastError,
    finishedAt: new Date().toISOString(),
  };

  if (!options.dryRun) {
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log("LEGAL: Shein scrape attempt — prefer Bright Data for 100k. Not production-ready.\n");

  const report = await runSheinCatalogScraper(options);
  console.log(`\nShein scrape report: written=${report.written} blocked=${report.blocked}`);
  console.log(`Blockers: ${report.blockers.join(", ") || "none"}`);
  console.log(`Recommendation: ${report.recommendation}`);
  if (!options.dryRun) console.log(`Report: ${REPORT_PATH}`);

  if (report.written === 0) {
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
