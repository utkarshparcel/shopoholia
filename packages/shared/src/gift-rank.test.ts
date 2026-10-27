import { describe, expect, it } from "vitest";
import { DEFAULT_GIFT_IDEA_LIMIT, rankGiftIdeas } from "./gift-rank.js";

const listings = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Silk saree",
    category: "ethnic",
    tags: ["saree", "silk"],
    coinPrice: 40,
    affiliateUrl: "https://example.com/saree",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Cotton kurta",
    category: "ethnic",
    tags: ["kurta"],
    coinPrice: 25,
    affiliateUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    title: "Leather boots",
    category: "shoes",
    tags: ["boots"],
    coinPrice: 55,
    affiliateUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    title: "Budget kurta set",
    category: "ethnic",
    tags: ["kurta", "festive"],
    coinPrice: 18,
    affiliateUrl: "https://example.com/kurta",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    title: "Designer saree",
    category: "ethnic",
    tags: ["saree"],
    coinPrice: 90,
    affiliateUrl: null,
  },
];

describe("rankGiftIdeas", () => {
  it("returns exactly 3 gifts ranked by taste within budget", () => {
    const ideas = rankGiftIdeas({
      listings,
      tasteTags: ["saree", "kurta"],
      budgetCap: 50,
      limit: DEFAULT_GIFT_IDEA_LIMIT,
    });
    expect(ideas).toHaveLength(3);
    expect(ideas.every((i) => i.coinPrice <= 50)).toBe(true);
    // All three score 3 on taste; tie-break by coinPrice asc.
    expect(ideas.map((i) => i.id)).toEqual([
      "00000000-0000-4000-8000-000000000004", // kurta @ 18
      "00000000-0000-4000-8000-000000000002", // kurta @ 25
      "00000000-0000-4000-8000-000000000001", // saree @ 40
    ]);
    expect(ideas[0]!.reason).toContain("kurta");
    expect(ideas[0]!.score).toBeGreaterThan(0);
  });

  it("excludes over-budget listings even with strong taste match", () => {
    const ideas = rankGiftIdeas({
      listings,
      tasteTags: ["saree"],
      budgetCap: 50,
    });
    expect(ideas.every((i) => i.id !== "00000000-0000-4000-8000-000000000005")).toBe(
      true,
    );
    expect(ideas[0]!.id).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("falls back to popular pool when no taste tags", () => {
    const ideas = rankGiftIdeas({
      listings,
      tasteTags: [],
      budgetCap: 30,
      limit: 3,
    });
    expect(ideas).toHaveLength(2); // only 2 under 30
    expect(ideas.every((i) => i.coinPrice <= 30)).toBe(true);
    expect(ideas.every((i) => i.reason === "Popular pick")).toBe(true);
  });

  it("boosts wishlist titles and tie-breaks by id", () => {
    const ideas = rankGiftIdeas({
      listings: [
        {
          id: "b",
          title: "Silk scarf",
          category: "accessories",
          coinPrice: 20,
        },
        {
          id: "a",
          title: "Silk scarf twin",
          category: "accessories",
          coinPrice: 20,
        },
      ],
      wishlistTitles: ["silk scarf"],
      budgetCap: null,
      limit: 2,
    });
    expect(ideas[0]!.reason).toBe("Wishlist match");
    // Equal score + price → id ascending
    expect(ideas.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("ignores invalid budget caps and empty wishlist", () => {
    const ideas = rankGiftIdeas({
      listings,
      tasteTags: ["boots"],
      budgetCap: Number.NaN,
      wishlistTitles: ["   "],
      limit: 1,
    });
    expect(ideas[0]!.id).toBe("00000000-0000-4000-8000-000000000003");
  });
});
