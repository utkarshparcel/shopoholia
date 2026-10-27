import { describe, expect, it } from "vitest";
import {
  isBagCategory,
  isShoeCategory,
  isShoeOrBagCategory,
  rotationKind,
  suggestShoeBagRotation,
} from "./shoe-bag-rotation.js";

describe("N29 shoe/bag category filter", () => {
  it("filters shoes and bags from free-text categories", () => {
    expect(isShoeCategory("leather sneakers")).toBe(true);
    expect(isShoeCategory("oxford shirt")).toBe(false);
    expect(isBagCategory("crossbody bag")).toBe(true);
    expect(isBagCategory("tote")).toBe(true);
    expect(isBagCategory("sneakers")).toBe(false);
    expect(isShoeOrBagCategory("heels")).toBe(true);
    expect(isShoeOrBagCategory("clutch purse")).toBe(true);
    expect(isShoeOrBagCategory("jeans")).toBe(false);
    expect(rotationKind("boots")).toBe("shoes");
    expect(rotationKind("handbag")).toBe("bag");
    expect(rotationKind("shirt")).toBeNull();
  });
});

describe("suggestShoeBagRotation", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");
  const items = [
    { id: "s1", category: "white sneakers", brand: "Nike" },
    { id: "s2", category: "brown boots" },
    { id: "b1", category: "leather tote bag" },
    { id: "t1", category: "oxford shirt" },
  ];

  it("only suggests shoe/bag categories and prefers never-worn", () => {
    const suggestions = suggestShoeBagRotation(
      items,
      [
        {
          wardrobeItemId: "s1",
          wornOn: new Date("2026-08-25T08:00:00.000Z"),
        },
      ],
      { now, limit: 10 },
    );
    expect(suggestions.every((s) => s.kind === "shoes" || s.kind === "bag")).toBe(true);
    expect(suggestions.map((s) => s.id)).not.toContain("t1");
    expect(suggestions[0]!.id).not.toBe("s1"); // recently worn demoted
    expect(suggestions.some((s) => s.id === "s2" && s.wearCount === 0)).toBe(true);
    expect(suggestions.some((s) => s.id === "b1")).toBe(true);
  });

  it("expands outfit wear logs and can filter by kind", () => {
    const suggestions = suggestShoeBagRotation(
      items,
      [{ outfitId: "o1", wornOn: new Date("2026-08-24T08:00:00.000Z") }],
      {
        now,
        kind: "shoes",
        outfits: [{ id: "o1", itemIds: ["s2", "t1", "b1"] }],
      },
    );
    expect(suggestions.every((s) => s.kind === "shoes")).toBe(true);
    const boots = suggestions.find((s) => s.id === "s2");
    expect(boots?.wearCount).toBe(1);
  });
});
