import { describe, it, expect } from "vitest";
import { missingRegionPacks, REGION_PACK_SEEDS, regionPackKey } from "./region-packs.js";

describe("region-packs", () => {
  it("includes at least one non-IN pack (suit/hemming)", () => {
    const nonIn = REGION_PACK_SEEDS.filter((p) => p.region !== "IN");
    expect(nonIn.length).toBeGreaterThanOrEqual(1);
    expect(nonIn.some((p) => p.region === "US" && p.garmentType === "SUIT")).toBe(true);
    expect(nonIn.some((p) => p.region === "US" && p.name.toLowerCase().includes("hem"))).toBe(true);
  });

  it("missingRegionPacks returns only packs not already seeded", () => {
    const existing = REGION_PACK_SEEDS.filter((p) => p.region === "IN").map((p) => ({
      region: p.region,
      name: p.name,
    }));
    const missing = missingRegionPacks(existing);
    expect(missing.every((p) => p.region !== "IN")).toBe(true);
    expect(missing.some((p) => p.region === "US")).toBe(true);
    expect(missing.some((p) => p.region === "GLOBAL")).toBe(true);
  });

  it("regionPackKey normalizes case", () => {
    expect(regionPackKey("us", " Suit — US Tailoring ")).toBe(
      regionPackKey("US", "Suit — US Tailoring"),
    );
  });
});
