import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/schema/enums.ts",
        "src/schema/columns.ts",
        "src/queries/money.ts",
      ],
      exclude: ["**/*.test.ts"],
      thresholds: {
        lines: 95,
        functions: 90,
        branches: 90,
        statements: 95,
      },
    },
  },
});
