import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "src/index.ts", "src/queues.ts"],
      thresholds: {
        lines: 85,
        functions: 80,
        branches: 55,
        statements: 85,
      },
    },
  },
});
