#!/usr/bin/env tsx
/**
 * LEGAL DISCLAIMER — R&D FEASIBILITY PROBES ONLY
 *
 * Runs all fashion e-commerce scrape feasibility probes (1–2 requests per site).
 * Not for production. See probe-runner.ts for full disclaimer.
 */
import { mkdir } from "node:fs/promises";
import { INTER_REQUEST_DELAY_MS, OUTPUT_DIR, printSummaryTable, sleep } from "./probe-runner.js";
import { probeAjio } from "./probe-ajio.js";
import { probeAmazonIn } from "./probe-amazon-in.js";
import { probeFlipkart } from "./probe-flipkart.js";
import { probeMyntra } from "./probe-myntra.js";
import { probeNewme } from "./probe-newme.js";
import { probeShein } from "./probe-shein.js";
import type { ProbeResult } from "./types.js";

const PROBES: Array<{ name: string; run: () => Promise<ProbeResult> }> = [
  { name: "newme", run: probeNewme },
  { name: "shein", run: probeShein },
  { name: "myntra", run: probeMyntra },
  { name: "ajio", run: probeAjio },
  { name: "amazon-in", run: probeAmazonIn },
  { name: "flipkart", run: probeFlipkart },
];

async function main(): Promise<void> {
  console.log("WORN scrape feasibility probes (R&D only)\n");
  await mkdir(OUTPUT_DIR, { recursive: true });

  const results: ProbeResult[] = [];
  for (let i = 0; i < PROBES.length; i += 1) {
    const { name, run } = PROBES[i]!;
    console.log(`→ Probing ${name}...`);
    try {
      const result = await run();
      results.push(result);
      console.log(
        `  ${result.success ? "✓" : "✗"} ${name} (${result.method}, ${result.latencyMs}ms)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${name} — ${message}`);
      results.push({
        site: name,
        success: false,
        method: "fetch",
        latencyMs: 0,
        fieldsExtracted: { images: [] },
        error: message,
        antiBotSignals: {
          captcha: false,
          forbidden403: false,
          empty: true,
          blocked: false,
          cloudflare: false,
        },
      });
    }
    if (i < PROBES.length - 1) await sleep(INTER_REQUEST_DELAY_MS);
  }

  printSummaryTable(results);

  const anySuccess = results.some((r) => r.success);
  process.exit(anySuccess ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
