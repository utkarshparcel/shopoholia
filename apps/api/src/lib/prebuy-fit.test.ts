import { describe, expect, it } from "vitest";
import {
  computePrebuyFit,
  parseRealPriceToMinor,
  resolveCandidatePriceMinor,
  titleSimilarity,
} from "./prebuy-fit.js";

describe("prebuy-fit scoring (N33)", () => {
  it("parses real prices and coin fallback", () => {
    expect(parseRealPriceToMinor("₹2,499")).toBe(249900);
    expect(resolveCandidatePriceMinor({ coinPrice: 50, qty: 2 })).toBe(10000);
    expect(resolveCandidatePriceMinor({ realPrice: "100", coinPrice: 50, qty: 1 })).toBe(10000);
  });

  it("scores title overlap as a fixture", () => {
    expect(titleSimilarity("Navy linen shirt", "Navy linen shirt")).toBe(1);
    expect(titleSimilarity("Navy linen shirt", "Red sneakers")).toBe(0);

    const result = computePrebuyFit(
      [
        {
          title: "Navy linen shirt",
          category: "APPAREL",
          brand: "Uniqlo",
          priceMinor: 250000,
        },
      ],
      [
        {
          id: "00000000-0000-0000-0000-000000000001",
          category: "shirt",
          brand: "Uniqlo",
          label: "Uniqlo navy linen shirt",
        },
      ],
      [{ category: "APPAREL", period: "MONTHLY", limitMinor: 500000, actualMinor: 100000 }],
    );

    expect(result.overlaps.length).toBeGreaterThan(0);
    expect(result.overlaps[0]!.reason).toBe("TITLE");
    expect(result.score).toBeLessThan(80);
    expect(result.summary.toLowerCase()).toContain("similar");
  });

  it("flags gap fill and budget soft block", () => {
    const gapFill = computePrebuyFit(
      [{ title: "Leather belt", category: "ACCESSORIES", priceMinor: 50000 }],
      [],
      [],
    );
    expect(gapFill.gaps.length).toBe(1);
    expect(gapFill.gaps[0]!.ownedCount).toBe(0);
    expect(gapFill.score).toBeGreaterThanOrEqual(80);

    const overBudget = computePrebuyFit(
      [{ title: "Festival kurta", category: "APPAREL", priceMinor: 400000 }],
      [],
      [{ category: "APPAREL", period: "MONTHLY", limitMinor: 300000, actualMinor: 0 }],
    );
    expect(overBudget.softBlock).toBe(true);
    expect(overBudget.budgetNudges.some((n) => n.exceeded)).toBe(true);
    expect(overBudget.score).toBeLessThan(80);
  });
});
