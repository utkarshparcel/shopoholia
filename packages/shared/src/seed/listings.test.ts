import { describe, expect, it } from "vitest";
import { buildSeedListings } from "./listings.js";

describe("buildSeedListings", () => {
  it("builds 50 listings with variants", () => {
    const listings = buildSeedListings(50);
    expect(listings).toHaveLength(50);
    expect(listings[0]?.variants.length).toBeGreaterThanOrEqual(2);
    expect(listings[0]?.coinPrice).toBeGreaterThan(0);
  });

  it("puts each piece in its own category with sizes that fit it", () => {
    const listings = buildSeedListings(50);
    const byTitle = (re: RegExp) => listings.filter((l) => re.test(l.title));
    for (const l of byTitle(/crewneck|turtleneck|tank|cardigan/)) expect(l.category).toBe("Tops");
    for (const l of byTitle(/boots/)) {
      expect(l.category).toBe("Shoes");
      for (const v of l.variants) expect(v.size).toMatch(/^UK \d+$/);
    }
    for (const l of byTitle(/bag|tote/)) {
      expect(l.category).toBe("Bags");
      for (const v of l.variants) expect(v.size).toBe("One size");
    }
    for (const l of byTitle(/dress$/)) expect(l.category).toBe("Dresses");
    for (const l of listings) {
      const keys = l.variants.map((v) => `${v.size}/${v.color}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
