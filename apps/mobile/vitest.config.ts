import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/components/ui/**/*.{ts,tsx}", "src/theme/tokens.ts"],
      exclude: ["src/components/ui/index.ts", "**/*.test.{ts,tsx}"],
      thresholds: {
        lines: 95,
        functions: 100,
        branches: 85,
        statements: 95,
      },
    },
  },
});
