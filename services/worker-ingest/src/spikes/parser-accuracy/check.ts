import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultRegistry } from "../../parsers/index.js";
import { InMemoryMetricsSink } from "../../parsers/metrics.js";
import { parseEml } from "./fixtures/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(here, "fixtures");

export const COVERAGE_THRESHOLD = 0.8;
export const ACCURACY_THRESHOLD = 0.9;

// Expected totals in minor units (paise) for grand-total accuracy;
// unknown-promo is intentionally 0 (should be unmatched)
export const EXPECTED_TOTALS: Record<string, number> = {
  "amazon.eml": 129900,
  "flipkart.eml": 84900,
  "myntra.eml": 239900,
  "swiggy.eml": 42700,
  "zomato.eml": 61500,
  "generic-receipt.eml": 154000,
  "unknown-promo.eml": 0,
};

export const EXPECTED_CURRENCY: Record<string, string> = {
  "amazon.eml": "INR",
  "flipkart.eml": "INR",
  "myntra.eml": "INR",
  "swiggy.eml": "INR",
  "zomato.eml": "INR",
  "generic-receipt.eml": "INR",
};

export interface AccuracyReport {
  total: number;
  purchaseFixtures: number;
  hits: number;
  coverage: number; // specific hits / purchase fixtures
  grandTotalCorrect: number;
  grandTotalAccuracy: number;
  currencyCorrect: number;
  currencyAccuracy: number;
  perParser: Record<string, number>;
  unmatched: string[];
  failures: string[];
}

export function runAccuracyCheck(fixturesDir: string = FIXTURES_DIR): AccuracyReport {
  const metrics = new InMemoryMetricsSink();
  const registry = createDefaultRegistry(metrics);

  const files = readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".eml"))
    .sort();

  const perParser: Record<string, number> = {};
  const unmatched: string[] = [];
  let hits = 0;
  let grandTotalCorrect = 0;
  let currencyCorrect = 0;
  const failures: string[] = [];

  // purchaseFixtures excludes true non-receipt promos where expected is 0 and should be unmatched
  const purchaseFiles = files.filter((f) => EXPECTED_TOTALS[f] !== 0);
  const purchaseTotal = purchaseFiles.length;

  for (const file of files) {
    const raw = readFileSync(join(fixturesDir, file), "utf8");
    const msg = parseEml(raw, file);
    const result = registry.parse(msg);
    const expectedTotal = EXPECTED_TOTALS[file];
    const expectedCurrency = EXPECTED_CURRENCY[file];

    if (result.matched && result.parserId && result.parserId !== "generic") {
      hits += 1;
      perParser[result.parserId] = (perParser[result.parserId] ?? 0) + 1;
    } else if (!result.matched) {
      unmatched.push(file);
    } else {
      // generic match
      perParser[result.parserId ?? "generic"] = (perParser[result.parserId ?? "generic"] ?? 0) + 1;
    }

    if (expectedTotal !== undefined) {
      if (expectedTotal === 0) {
        // promo should be unmatched or zero total
        if (!result.matched || (result.purchase && result.purchase.totalMinor === 0)) {
          grandTotalCorrect += 1;
        } else {
          failures.push(`${file}: expected unmatched/0, got ${result.purchase?.totalMinor}`);
        }
      } else {
        const got = result.purchase?.totalMinor ?? 0;
        if (got === expectedTotal) {
          grandTotalCorrect += 1;
        } else {
          failures.push(`${file}: expected ${expectedTotal}, got ${got}`);
        }
      }
    }

    if (expectedCurrency && result.purchase) {
      if (result.purchase.currency === expectedCurrency) {
        currencyCorrect += 1;
      } else {
        failures.push(`${file}: expected currency ${expectedCurrency}, got ${result.purchase.currency}`);
      }
    }
  }

  const total = files.length;
  const coverage = purchaseTotal === 0 ? 0 : hits / purchaseTotal;
  const grandTotalAccuracy = purchaseTotal === 0 ? 0 : grandTotalCorrect / files.length; // includes promo for strictness, but promo already counted
  // Better: accuracy over purchase + promo? Use files.length as denominator for grandTotal, but promo counts.
  // For threshold we check against purchaseFixtures
  const currencyAccuracy = purchaseTotal === 0 ? 0 : currencyCorrect / purchaseTotal;

  return {
    total,
    purchaseFixtures: purchaseTotal,
    hits,
    coverage,
    grandTotalCorrect,
    grandTotalAccuracy: grandTotalAccuracy,
    currencyCorrect,
    currencyAccuracy,
    perParser,
    unmatched,
    failures,
  };
}

export function checkThresholds(report: AccuracyReport): { passed: boolean; messages: string[] } {
  const messages: string[] = [];
  let passed = true;

  // Coverage is specific hits / purchase fixtures (excludes promo)
  const covPct = (report.coverage * 100).toFixed(1);
  if (report.coverage < COVERAGE_THRESHOLD) {
    passed = false;
    messages.push(`Coverage ${covPct}% below threshold ${COVERAGE_THRESHOLD * 100}% (hits ${report.hits}/${report.purchaseFixtures})`);
  } else {
    messages.push(`Coverage ${covPct}% >= ${COVERAGE_THRESHOLD * 100}% OK`);
  }

  // Grand-total accuracy: correct totals / total fixtures (including promo)
  // We use grandTotalCorrect / total for overall, but purchase accuracy more meaningful
  const accuracy = report.total === 0 ? 0 : report.grandTotalCorrect / report.total;
  const accPct = (accuracy * 100).toFixed(1);
  if (accuracy < ACCURACY_THRESHOLD) {
    passed = false;
    messages.push(`Grand-total accuracy ${accPct}% below threshold ${ACCURACY_THRESHOLD * 100}% (${report.grandTotalCorrect}/${report.total})`);
  } else {
    messages.push(`Grand-total accuracy ${accPct}% >= ${ACCURACY_THRESHOLD * 100}% OK`);
  }

  if (report.failures.length > 0) {
    messages.push(`Failures: ${report.failures.join("; ")}`);
  }

  return { passed, messages };
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const report = runAccuracyCheck();
  const pct = (report.coverage * 100).toFixed(1);
  const accPct = ((report.grandTotalCorrect / report.total) * 100).toFixed(1);
  console.log("=== Parser-accuracy threshold check ===");
  console.log(`Fixtures: ${report.total} (purchase: ${report.purchaseFixtures})`);
  console.log(`Specific hits: ${report.hits}`);
  console.log(`Coverage: ${pct}% (threshold ${COVERAGE_THRESHOLD * 100}%)`);
  console.log(`Grand-total accuracy: ${accPct}% (${report.grandTotalCorrect}/${report.total}, threshold ${ACCURACY_THRESHOLD * 100}%)`);
  console.log(`Currency accuracy: ${(report.currencyAccuracy * 100).toFixed(1)}%`);
  console.log("Per-parser:", JSON.stringify(report.perParser));
  if (report.unmatched.length) console.log(`Unmatched: ${report.unmatched.join(", ")}`);
  if (report.failures.length) console.log(`Failures: ${report.failures.join("; ")}`);

  const { passed, messages } = checkThresholds(report);
  for (const m of messages) console.log(m);
  if (!passed) {
    console.error("Threshold check FAILED");
    process.exit(1);
  } else {
    console.log("Threshold check PASSED");
  }
}
