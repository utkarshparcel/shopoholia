import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/index.ts",
        "src/render.ts",
        "**/*.test.ts",
      ],
      // Honest floor while Closet push-flow + Play economy still grow.
      thresholds: {
        lines: 90,
        functions: 80,
        branches: 75,
        statements: 90,
      },
    },
  },
});
