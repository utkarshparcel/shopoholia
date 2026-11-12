import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The quality tests encode and decode real images in pure JS: slow on a busy CI runner.
    testTimeout: 30_000,
  },
});
