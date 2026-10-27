import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "expo-haptics": path.resolve(__dirname, "src/lib/expo-haptics.stub.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/components/ui/**/*.{ts,tsx}",
        "src/components/PremiumGate.tsx",
        "src/theme/tokens.ts",
        "src/hooks/closet/**/*.{ts,tsx}",
        "src/stores/closet.ts",
        "src/stores/session.ts",
        "src/lib/confidenceBadge.ts",
        "src/lib/expiryBadge.ts",
        "src/lib/warrantyBadge.ts",
        "src/lib/returnCountdown.ts",
        "src/lib/foundMoney.ts",
        "src/lib/socialPolls.ts",
        "src/lib/outfitWhy.ts",
        "src/lib/wasteMoney.ts",
        "src/lib/firstDelight.ts",
        "src/lib/vaultWow.ts",
        "src/lib/features.ts",
        "src/lib/delightHaptics.ts",
        "src/lib/format.ts",
        "src/lib/sms.ts",
        "src/lib/shareFile.ts",
      ],
      exclude: [
        "src/components/ui/index.ts",
        "src/lib/delight.ts",
        "**/*.test.{ts,tsx}",
      ],
      // useCloset.ts is ~1.1k lines / 100+ hooks — included for honest Closet
      // measurement; aggregate gate is lower than the prior UI-only 70% bar.
      thresholds: {
        lines: 55,
        functions: 45,
        branches: 70,
        statements: 55,
      },
    },
  },
});
