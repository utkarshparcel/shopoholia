import { defineConfig } from "vitest/config";

/**
 * Closet-critical coverage surface. Play-only routes/libs and live-Postgres
 * repo are excluded so % reflects Closet behavior, not skipped integration.
 * Do not shrink include further to invent 100%.
 */
export default defineConfig({
  test: {
    environment: "node",
    // Parallel-merge / multi-agent load: Fastify inject + transform can exceed
    // vitest's 5s default and false-red N25/N26/outfits under coverage.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/routes/accountant.ts",
        "src/routes/credits.ts",
        "src/routes/vault.ts",
        "src/routes/receipts.ts",
        "src/routes/wardrobe.ts",
        "src/routes/outfits.ts",
        "src/routes/returns.ts",
        "src/routes/ingestion.ts",
        "src/routes/disposition.ts",
        "src/routes/fit.ts",
        "src/routes/gifts.ts",
        "src/routes/waste.ts",
        "src/routes/ingestion-metrics.ts",
        "src/lib/budget.ts",
        "src/lib/expiry.ts",
        "src/lib/return-jobs.ts",
        "src/lib/retention.ts",
        "src/lib/ingest-queue.ts",
        "src/lib/ingestion-metrics.ts",
        "src/lib/ingestion-activity.ts",
        "src/lib/money-reconcile.ts",
        "src/lib/balance-check.ts",
        "src/lib/balance-check-jobs.ts",
        "src/lib/festivals.ts",
        "src/lib/weather.ts",
        "src/lib/wardrobe-jobs.ts",
        "src/lib/disposition-marketplace.ts",
        "src/lib/disposition-logistics.ts",
        "src/lib/gift-jobs.ts",
        "src/lib/tailoring-jobs.ts",
        "src/lib/borrow-lent-jobs.ts",
        "src/lib/photo-dump.ts",
        "src/lib/entitlements.ts",
        "src/lib/tax-pack.ts",
        "src/lib/cooling-off.ts",
        "src/lib/auth/consent.ts",
        "src/lib/returns/state-machine.ts",
        "src/lib/ocr/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      thresholds: {
        lines: 88,
        functions: 90,
        branches: 55,
        statements: 88,
      },
    },
  },
});
