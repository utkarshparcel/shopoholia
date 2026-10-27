import { describe, expect, it } from "vitest";
import {
  categorySlot,
  companionSlots,
  goesWithScore,
  rankGoesWith,
} from "./outfit-goes-with.js";

describe("categorySlot / companionSlots", () => {
  it("maps free-text categories onto garment slots", () => {
    expect(categorySlot("Blue Shirt")).toBe("top");
    expect(categorySlot("Slim Jeans")).toBe("bottom");
    expect(categorySlot("Running Sneakers")).toBe("shoes");
    expect(categorySlot("Wool Coat")).toBe("outer");
    expect(categorySlot("Evening Dress")).toBe("dress");
    expect(categorySlot("Leather Belt")).toBe("accessory");
    expect(categorySlot("mystery")).toBe("other");
  });

  it("lists compatible companion slots", () => {
    expect(companionSlots("top")).toContain("bottom");
    expect(companionSlots("dress")).toEqual(["shoes", "outer", "accessory"]);
    expect(companionSlots("other").length).toBeGreaterThan(3);
  });
});

describe("goesWithScore / rankGoesWith", () => {
  const shirt = {
    id: "1",
    category: "Shirt",
    colors: ["navy"],
    brand: "Uniqlo",
  };
  const jeans = {
    id: "2",
    category: "Jeans",
    colors: ["black"],
    brand: "Levi's",
  };
  const sameShirt = { ...shirt, id: "1" };

  it("scores classic top↔bottom higher than incompatible pairs", () => {
    const match = goesWithScore(shirt, jeans);
    expect(match.score).toBeGreaterThan(10);
    expect(match.reasons.some((r) => /classic/i.test(r))).toBe(true);

    const self = goesWithScore(shirt, sameShirt);
    expect(self.score).toBe(0);

    const twoTops = goesWithScore(shirt, {
      id: "3",
      category: "Tee",
      colors: ["white"],
    });
    expect(twoTops.score).toBe(0);
  });

  it("ranks wardrobe candidates with color and brand bonuses", () => {
    const ranked = rankGoesWith(
      shirt,
      [
        jeans,
        {
          id: "4",
          category: "Sneakers",
          colors: ["navy"],
          brand: "Uniqlo",
        },
        { id: "5", category: "Shirt", colors: ["red"] },
      ],
      { limit: 5 },
    );
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked.every((r) => r.score > 0)).toBe(true);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });
});
