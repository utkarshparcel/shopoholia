import { describe, expect, it } from "vitest";
import {
  buildTwinMatchQuery,
  findReplaceTwins,
  twinMatchScore,
} from "./replace-twin.js";

describe("replace-twin match query", () => {
  it("builds match query from dead item category/color/brand", () => {
    const q = buildTwinMatchQuery({
      id: "dead-1",
      category: "Black Jeans",
      colors: ["Black", "Indigo"],
      brand: "Levi's",
    });
    expect(q.category).toBe("black jeans");
    expect(q.colors).toEqual(["black", "indigo"]);
    expect(q.brand).toBe("levi's");
    expect(q.tokens).toContain("jeans");
    expect(q.tokens).toContain("black");
  });

  it("scores same-category + color twin higher than unrelated", () => {
    const q = buildTwinMatchQuery({
      id: "dead-1",
      category: "jeans",
      colors: ["blue"],
      brand: "Levis",
    });
    const twin = twinMatchScore(q, {
      id: "l1",
      title: "Blue Slim Jeans",
      category: "jeans",
      tags: ["blue"],
      affiliateUrl: "https://aff.example/jeans",
      status: "ACTIVE",
    });
    const miss = twinMatchScore(q, {
      id: "l2",
      title: "Red Party Dress",
      category: "dresses",
      tags: ["red"],
      affiliateUrl: "https://aff.example/dress",
      status: "ACTIVE",
    });
    expect(twin.score).toBeGreaterThan(0);
    expect(twin.reasons.some((r) => /category/i.test(r))).toBe(true);
    expect(miss.score).toBe(0);
  });

  it("findReplaceTwins ranks affiliate candidates for dead item", () => {
    const dead = {
      id: "dead-1",
      category: "white shirt",
      colors: ["white"],
      brand: "Uniqlo",
    };
    const listings = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Uniqlo White Oxford Shirt",
        category: "shirt",
        tags: ["white", "cotton"],
        affiliateUrl: "https://aff.example/shirt-1",
        status: "ACTIVE",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Black Boots",
        category: "boots",
        tags: ["black"],
        affiliateUrl: "https://aff.example/boots",
        status: "ACTIVE",
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        title: "White Tee",
        category: "tops",
        tags: ["white"],
        affiliateUrl: null,
        affiliateLinks: [
          { url: "https://myntra.example/tee", platform: "myntra", label: "Myntra" },
        ],
        status: "ACTIVE",
      },
    ];
    const twins = findReplaceTwins(dead, listings, { limit: 5 });
    expect(twins.length).toBeGreaterThanOrEqual(1);
    expect(twins[0]!.listingId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(twins[0]!.affiliateUrl).toContain("aff.example");
    expect(twins.every((t) => t.matchQuery.category.includes("shirt") || t.matchQuery.tokens.includes("shirt"))).toBe(
      true,
    );
    expect(twins.some((t) => t.listingId.includes("bbbb"))).toBe(false);
  });
});
