import { describe, expect, it } from "vitest";
import {
  buildCompleteLook,
  detectMissingSlots,
  filledLookSlots,
} from "./complete-look.js";

describe("complete-look slot builder", () => {
  it("fills owned slots and detects missing pieces", () => {
    const owned = [
      { id: "1", category: "blue shirt", colors: ["blue"] },
      { id: "2", category: "sneakers", colors: ["white"] },
    ];
    const filled = filledLookSlots(owned);
    expect(filled.map((f) => f.slot).sort()).toEqual(["shoes", "top"]);
    const gaps = detectMissingSlots(owned);
    expect(gaps.map((g) => g.slot)).toEqual(["bottom"]);
    expect(gaps[0]!.message).toMatch(/bottom/i);
    expect(gaps[0]!.ownedCompanions).toBe(2);
  });

  it("dress covers top+bottom; only shoes may be missing", () => {
    const gaps = detectMissingSlots([{ id: "1", category: "black dress", colors: ["black"] }]);
    expect(gaps.map((g) => g.slot)).toEqual(["shoes"]);
  });

  it("buildCompleteLook returns owned + affiliate missing slots", () => {
    const owned = [
      { id: "1", category: "navy blazer", colors: ["navy"] },
      { id: "2", category: "white shirt", colors: ["white"] },
    ];
    const listings = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Navy Chinos",
        category: "trousers",
        tags: ["navy"],
        affiliateUrl: "https://aff.example/chinos",
        status: "ACTIVE",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "White Sneakers",
        category: "sneakers",
        tags: ["white"],
        affiliateUrl: "https://aff.example/sneakers",
        status: "ACTIVE",
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        title: "Red Tie",
        category: "tie",
        tags: ["red"],
        affiliateUrl: "https://aff.example/tie",
        status: "ACTIVE",
      },
    ];
    const look = buildCompleteLook({ owned, listings });
    expect(look.owned.some((o) => o.slot === "top")).toBe(true);
    expect(look.gaps.map((g) => g.slot).sort()).toEqual(["bottom", "shoes"]);
    expect(look.missing.length).toBeGreaterThanOrEqual(2);
    expect(look.missing.every((m) => m.affiliateUrl)).toBe(true);
    expect(look.missing.some((m) => m.slot === "bottom")).toBe(true);
    expect(look.missing.some((m) => m.slot === "shoes")).toBe(true);
    expect(look.missing.some((m) => m.slot === "accessory")).toBe(false);
    expect(look.summary).toMatch(/owned/i);
  });

  it("complete look with full owned set has no missing fills", () => {
    const owned = [
      { id: "1", category: "tee", colors: ["black"] },
      { id: "2", category: "jeans", colors: ["blue"] },
      { id: "3", category: "sneakers", colors: ["white"] },
    ];
    const look = buildCompleteLook({ owned, listings: [] });
    expect(look.gaps).toHaveLength(0);
    expect(look.missing).toHaveLength(0);
    expect(look.summary).toMatch(/complete/i);
  });
});
