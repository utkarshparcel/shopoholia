import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/routes/index.ts",
        "src/routes/coins.ts",
        "src/routes/orders.ts",
        "src/routes/reveal.ts",
        "src/routes/webhooks.ts",
        "src/lib/repositories/types.ts",
      ],
      thresholds: {
        lines: 97,
        functions: 97,
        branches: 84,
        statements: 97,
      },
    },
  },
});
