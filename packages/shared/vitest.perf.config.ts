import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.js";

/**
 * The wall-clock budgets (`pnpm test:perf`). They only mean something on a quiet machine, so they
 * run here, one file at a time in a single process, and not in the main run, where every package's
 * tests share the CPU. The budgets are set on a developer laptop; slower hardware (GitHub's shared
 * runners) passes PERF_BUDGET_SCALE to stretch them.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: [
        "src/closet-composer/week.test.ts",
        "src/closet-composer/style.test.ts",
        "src/closet-style/score.test.ts",
      ],
      testNamePattern: /budget|in under/,
      env: { WORN_PERF_BUDGETS: "1" },
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      fileParallelism: false,
    },
  }),
);
