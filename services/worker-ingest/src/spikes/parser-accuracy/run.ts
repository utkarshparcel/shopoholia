import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultRegistry } from "../../parsers/index.js";
import { InMemoryMetricsSink } from "../../parsers/metrics.js";
import type { RawEmailMessage } from "../../parsers/types.js";
import { parseEml } from "./fixtures/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(here, "fixtures");

export interface SpikeReport {
  total: number;
  hits: number;
  misses: number;
  /** Fraction of fixtures matched by a *dedicated* merchant parser (0..1). */
  coverage: number;
  perParser: Record<string, number>;
  unmatched: string[];
}

/** Runs the parser framework over every `.eml` fixture and returns a coverage
 * report. Pure and reusable — drop real `.eml` files into `fixtures/` to extend. */
export function runSpike(fixturesDir: string = FIXTURES_DIR): SpikeReport {
  const metrics = new InMemoryMetricsSink();
  const registry = createDefaultRegistry(metrics);

  const files = readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".eml"))
    .sort();

  const perParser: Record<string, number> = {};
  const unmatched: string[] = [];
  let hits = 0;

  for (const file of files) {
    const raw = readFileSync(join(fixturesDir, file), "utf8");
    const msg: RawEmailMessage = parseEml(raw, file);
    const result = registry.parse(msg);
    if (result.matched && result.parserId && result.parserId !== "generic") {
      hits += 1;
      perParser[result.parserId] = (perParser[result.parserId] ?? 0) + 1;
    } else if (!result.matched) {
      unmatched.push(file);
    }
  }

  const total = files.length;
  const misses = total - hits;
  const coverage = total === 0 ? 0 : hits / total;

  return { total, hits, misses, coverage, perParser, unmatched };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const report = runSpike();
  const pct = (report.coverage * 100).toFixed(1);
  console.log("=== Parser-accuracy spike report ===");
  console.log(`Fixtures:                       ${report.total}`);
  console.log(`Specific-merchant hits:         ${report.hits}`);
  console.log(`Misses (generic or unmatched):  ${report.misses}`);
  console.log(`Coverage (specific hits / total): ${pct}%`);
  console.log("Per-parser:");
  for (const [parserId, count] of Object.entries(report.perParser)) {
    console.log(`  ${parserId}: ${count}`);
  }
  if (report.unmatched.length) {
    console.log(`Unmatched: ${report.unmatched.join(", ")}`);
  }
}
