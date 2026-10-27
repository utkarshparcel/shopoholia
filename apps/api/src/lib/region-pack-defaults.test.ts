import { describe, expect, it } from "vitest";
import {
  getRegionPackDefaults,
  listRegionPackDefaults,
  regionFestivalDates,
} from "./region-pack-defaults.js";

describe("U048 region-pack-defaults", () => {
  it("applies IN/US/UK merchants, festivals, and size labels", () => {
    const regions = listRegionPackDefaults().map((p) => p.region);
    expect(regions).toEqual(["IN", "US", "UK", "GLOBAL"]);

    const inPack = getRegionPackDefaults("IN");
    expect(inPack.merchants).toContain("Myntra");
    expect(inPack.festivals.some((f) => f.label === "Diwali")).toBe(true);
    expect(inPack.sizeSystem.label).toMatch(/India/i);

    const us = getRegionPackDefaults("US");
    expect(us.sizeSystem.examples).toContain("8");
    expect(us.festivals.some((f) => /Thanksgiving/i.test(f.label))).toBe(true);

    const ukFest = regionFestivalDates("UK", {
      year: 2026,
      from: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(ukFest.some((f) => f.label === "Christmas")).toBe(true);
  });
});
