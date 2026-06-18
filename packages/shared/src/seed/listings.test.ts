import { describe, expect, it } from "vitest";
import { buildSeedListings } from "./listings.js";

describe("buildSeedListings", () => {
  it("builds 50 listings with variants", () => {
    const listings = buildSeedListings(50);
    expect(listings).toHaveLength(50);
    expect(listings[0]?.variants.length).toBeGreaterThanOrEqual(2);
    expect(listings[0]?.coinPrice).toBeGreaterThan(0);
  });
});
