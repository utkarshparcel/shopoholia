#!/usr/bin/env tsx
/**
 * LEGAL DISCLAIMER — INTERNAL DATASET BUILDER
 *
 * Merges JSONL catalog sources into a unified import-catalog file.
 * Synthetic backfill is last resort and tagged source=synthetic.
 * Prefer licensed datasets and affiliate APIs for production scale.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildSeedListings } from "@worn/shared";
import { CATALOG_DIR, ensureCatalogDir, type CatalogRow } from "./lib/catalog-scrape.js";
import { parseCatalogFile, type CatalogImportRow } from "./import-catalog.js";

export type SourceConfig = {
  id: string;
  path: string;
  required: boolean;
};

export const DEFAULT_SOURCES: SourceConfig[] = [
  { id: "newme", path: "newme.jsonl", required: false },
  { id: "shein", path: "shein.jsonl", required: false },
  { id: "amazon", path: "amazon.jsonl", required: false },
  { id: "flipkart", path: "flipkart.jsonl", required: false },
];

export type Manifest = {
  target: number;
  totalRows: number;
  gap: number;
  honestAssessment: string;
  bySource: Record<string, number>;
  syntheticBackfill: number;
  outputPath: string;
  sources: Array<{ id: string; path: string; rows: number; present: boolean }>;
  generatedAt: string;
  nextSteps: string[];
};

export type BuildOptions = {
  target: number;
  outputPath: string;
  manifestPath: string;
  catalogDir: string;
  allowSynthetic: boolean;
  sources: SourceConfig[];
};

function defaultOptions(overrides: Partial<BuildOptions> = {}): BuildOptions {
  return {
    target: 100_000,
    outputPath: join(CATALOG_DIR, "merged-100k.jsonl"),
    manifestPath: join(CATALOG_DIR, "manifest.json"),
    catalogDir: CATALOG_DIR,
    allowSynthetic: true,
    sources: DEFAULT_SOURCES,
    ...overrides,
  };
}

function filterArgv(argv: string[]): string[] {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

function parseArgs(argv: string[]): BuildOptions {
  const options = defaultOptions();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") options.target = Number(argv[++i]);
    else if (arg === "--output") options.outputPath = argv[++i] ?? options.outputPath;
    else if (arg === "--manifest") options.manifestPath = argv[++i] ?? options.manifestPath;
    else if (arg === "--catalog-dir") options.catalogDir = argv[++i] ?? options.catalogDir;
    else if (arg === "--no-synthetic") options.allowSynthetic = false;
    else if (arg === "--help" || arg === "-h") {
      console.log(`build-catalog-dataset — merge catalog JSONL sources

Options:
  --target <n>         Target row count (default: 100000)
  --output <path>      Merged JSONL path (default: tmp/catalog/merged-100k.jsonl)
  --manifest <path>    Manifest JSON path (default: tmp/catalog/manifest.json)
  --catalog-dir <dir>  Source directory (default: tmp/catalog)
  --no-synthetic       Do not generate synthetic backfill rows
`);
      process.exit(0);
    }
  }
  return options;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function dedupeKey(row: CatalogImportRow): string {
  return row.affiliate_url.trim().toLowerCase();
}

export function deduplicateRows(rows: CatalogImportRow[]): CatalogImportRow[] {
  const seen = new Set<string>();
  const out: CatalogImportRow[] = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function buildSyntheticCatalogRows(count: number, startIndex = 0): CatalogImportRow[] {
  const seeds = buildSeedListings(count);
  return seeds.map((seed, i) => {
    const index = startIndex + i;
    const slug = seed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
    const hash = createHash("sha256").update(`synthetic:${index}:${seed.title}`).digest("hex").slice(0, 12);
    const variant = seed.variants[0];
    return {
      title: seed.title,
      category: seed.category,
      tags: ["synthetic", "backfill"],
      image_urls: [`https://picsum.photos/seed/worn-${hash}/533/800`],
      affiliate_url: `https://worn.app/catalog/synthetic/${hash}/${slug}`,
      source: "synthetic" as const,
      coin_price: seed.coinPrice,
      size: variant?.size,
      color: variant?.color,
    };
  });
}

export async function loadSourceRows(
  sources: SourceConfig[],
  catalogDir: string,
): Promise<{ rows: CatalogImportRow[]; stats: Manifest["sources"] }> {
  const allRows: CatalogImportRow[] = [];
  const stats: Manifest["sources"] = [];

  for (const source of sources) {
    const fullPath = join(catalogDir, source.path);
    const present = await fileExists(fullPath);
    let rows = 0;

    if (present) {
      const content = await readFile(fullPath, "utf8");
      const parsed = parseCatalogFile(content, source.path);
      allRows.push(...parsed);
      rows = parsed.length;
    } else if (source.required) {
      throw new Error(`Required source missing: ${fullPath}`);
    }

    stats.push({ id: source.id, path: fullPath, rows, present });
  }

  return { rows: allRows, stats };
}

export function buildManifest(
  options: BuildOptions,
  bySource: Record<string, number>,
  totalRows: number,
  syntheticBackfill: number,
  sourceStats: Manifest["sources"],
): Manifest {
  const gap = Math.max(0, options.target - totalRows);
  const realShein = bySource.shein ?? 0;
  const realNewme = bySource.newme ?? 0;

  const nextSteps: string[] = [];
  if (realShein < 90_000) {
    nextSteps.push("Purchase Bright Data Shein dataset (~$250 for 100k rows) → tmp/catalog/shein.jsonl");
  }
  if (realNewme < 5_000) {
    nextSteps.push("Run full Newme scraper: pnpm --filter @worn/api scrape-newme (~3–6h)");
  }
  if ((bySource.amazon ?? 0) === 0) {
    nextSteps.push("Add Amazon Creators API export → tmp/catalog/amazon.jsonl");
  }
  if ((bySource.flipkart ?? 0) === 0) {
    nextSteps.push("Add Flipkart Affiliate API export → tmp/catalog/flipkart.jsonl");
  }

  let honestAssessment: string;
  if (totalRows >= options.target && syntheticBackfill === 0) {
    honestAssessment = `Target ${options.target.toLocaleString()} reached with ${totalRows.toLocaleString()} real retailer rows.`;
  } else if (totalRows >= options.target && syntheticBackfill > 0) {
    honestAssessment =
      `Target ${options.target.toLocaleString()} reached, but only ${(totalRows - syntheticBackfill).toLocaleString()} ` +
      `are real retailer rows (Newme ~${realNewme.toLocaleString()}, Shein ~${realShein.toLocaleString()}). ` +
      `${syntheticBackfill.toLocaleString()} synthetic rows (source=synthetic) pad the dataset. ` +
      `Replace with Bright Data Shein + affiliate APIs for an honest 100k.`;
  } else if (syntheticBackfill > 0) {
    honestAssessment =
      `Only ${(totalRows - syntheticBackfill).toLocaleString()} real retailer rows available ` +
      `(Newme ~${realNewme.toLocaleString()}, Shein ~${realShein.toLocaleString()}). ` +
      `Filled ${syntheticBackfill.toLocaleString()} synthetic rows to approach target. ` +
      `100k honest catalog requires Bright Data Shein + affiliate APIs.`;
  } else {
    honestAssessment =
      `Gap of ${gap.toLocaleString()} rows to target. ` +
      `Newme caps at ~6k; Shein DIY scrape is blocked — use licensed dataset.`;
  }

  return {
    target: options.target,
    totalRows,
    gap,
    honestAssessment,
    bySource,
    syntheticBackfill,
    outputPath: options.outputPath,
    sources: sourceStats,
    generatedAt: new Date().toISOString(),
    nextSteps,
  };
}

export async function buildCatalogDataset(options: BuildOptions): Promise<Manifest> {
  await ensureCatalogDir();
  await mkdir(options.catalogDir, { recursive: true });

  const { rows: loaded, stats } = await loadSourceRows(options.sources, options.catalogDir);
  let merged = deduplicateRows(loaded);

  const bySource = merged.reduce<Record<string, number>>((acc, row) => {
    acc[row.source] = (acc[row.source] ?? 0) + 1;
    return acc;
  }, {});

  let syntheticBackfill = 0;
  if (options.allowSynthetic && merged.length < options.target) {
    const needed = options.target - merged.length;
    const synthetic = buildSyntheticCatalogRows(needed, merged.length);
    merged = [...merged, ...synthetic];
    syntheticBackfill = synthetic.length;
    bySource.synthetic = (bySource.synthetic ?? 0) + synthetic.length;
  }

  const lines = merged.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(options.outputPath, lines ? `${lines}\n` : "", "utf8");

  const manifest = buildManifest(
    options,
    bySource,
    merged.length,
    syntheticBackfill,
    stats,
  );
  await writeFile(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function main() {
  const options = parseArgs(filterArgv(process.argv.slice(2)));
  console.log("LEGAL: Dataset builder — synthetic rows are tagged source=synthetic.\n");

  const manifest = await buildCatalogDataset(options);
  console.log(`Merged ${manifest.totalRows.toLocaleString()} rows → ${manifest.outputPath}`);
  console.log(`By source: ${JSON.stringify(manifest.bySource)}`);
  console.log(`Synthetic backfill: ${manifest.syntheticBackfill.toLocaleString()}`);
  console.log(`Gap to target: ${manifest.gap.toLocaleString()}`);
  console.log(`\n${manifest.honestAssessment}`);
  if (manifest.nextSteps.length) {
    console.log("\nNext steps:");
    for (const step of manifest.nextSteps) console.log(`  - ${step}`);
  }
  console.log(`\nManifest: ${options.manifestPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
