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

  it("moves lunar and weekday-based festivals to each year's real date", () => {
    const on = (region: "IN" | "US" | "UK", year: number, label: string) =>
      regionFestivalDates(region, { year, from: new Date(Date.UTC(year, 0, 1)) }).find(
        (f) => f.label === label,
      )?.date;
    expect(on("IN", 2026, "Diwali")).toBe("2026-11-08T00:00:00.000Z");
    expect(on("IN", 2027, "Diwali")).toBe("2027-10-29T00:00:00.000Z");
    expect(on("IN", 2027, "Holi")).toBe("2027-03-22T00:00:00.000Z");
    expect(on("US", 2026, "Thanksgiving")).toBe("2026-11-26T00:00:00.000Z");
    expect(on("US", 2027, "Thanksgiving")).toBe("2027-11-25T00:00:00.000Z");
    expect(on("US", 2027, "Black Friday")).toBe("2027-11-26T00:00:00.000Z");
    expect(on("UK", 2026, "Bank Holiday")).toBe("2026-08-31T00:00:00.000Z");
    expect(on("UK", 2027, "Bank Holiday")).toBe("2027-08-30T00:00:00.000Z");
    // Outside the lunar table there is no date rather than a wrong one.
    expect(on("IN", 2031, "Diwali")).toBeUndefined();
  });

  it("without a year lists the next twelve months, across New Year", () => {
    const dec = regionFestivalDates("IN", { from: new Date("2026-12-01T00:00:00.000Z") });
    expect(dec.map((f) => f.label)).toEqual(["Holi", "Rakhi", "Diwali"]);
    expect(dec[0]!.date).toBe("2027-03-22T00:00:00.000Z");
  });
});
