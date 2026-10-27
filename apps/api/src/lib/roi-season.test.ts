import { describe, expect, it } from "vitest";
import {
  aggregateSeasonRoi,
  seasonForDate,
  seasonWindow,
} from "./roi-season.js";

describe("roi-season", () => {
  it("maps months to India closet seasons", () => {
    expect(seasonForDate(new Date("2026-03-15T00:00:00Z"))).toBe("SUMMER");
    expect(seasonForDate(new Date("2026-07-01T00:00:00Z"))).toBe("MONSOON");
    expect(seasonForDate(new Date("2026-12-01T00:00:00Z"))).toBe("WINTER");
    expect(seasonForDate(new Date("2026-01-10T00:00:00Z"))).toBe("WINTER");
  });

  it("builds season windows for year Y (winter spans into Y+1)", () => {
    const summer = seasonWindow(2026, "SUMMER");
    expect(summer.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(summer.end.toISOString()).toBe("2026-05-31T00:00:00.000Z");

    const monsoon = seasonWindow(2026, "MONSOON");
    expect(monsoon.start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(monsoon.end.toISOString()).toBe("2026-09-30T00:00:00.000Z");

    const winter = seasonWindow(2026, "WINTER");
    expect(winter.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(winter.end.toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });

  it("aggregates wears vs cost and idle (dead) cost per season", () => {
    const items = [
      { id: "a", costMinor: 10_000, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "b", costMinor: 5_000, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "c", costMinor: 20_000, createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    const wearLogs = [
      { wardrobeItemId: "a", wornOn: new Date("2026-04-10T12:00:00Z") },
      { wardrobeItemId: "a", wornOn: new Date("2026-04-20T12:00:00Z") },
      { wardrobeItemId: "b", wornOn: new Date("2026-07-05T12:00:00Z") },
      // winter wear for a
      { wardrobeItemId: "a", wornOn: new Date("2026-11-01T12:00:00Z") },
      // orphan log ignored
      { wardrobeItemId: null, wornOn: new Date("2026-04-01T12:00:00Z") },
    ];

    const report = aggregateSeasonRoi({ year: 2026, items, wearLogs });
    expect(report.year).toBe(2026);
    expect(report.seasons).toHaveLength(3);

    const summer = report.seasons.find((s) => s.season === "SUMMER")!;
    expect(summer.wears).toBe(2);
    expect(summer.itemsWorn).toBe(1);
    expect(summer.costWornMinor).toBe(10_000);
    expect(summer.itemsIdle).toBe(2); // b + c
    expect(summer.costIdleMinor).toBe(25_000);
    expect(summer.costPerWearMinor).toBe(5_000);

    const monsoon = report.seasons.find((s) => s.season === "MONSOON")!;
    expect(monsoon.wears).toBe(1);
    expect(monsoon.itemsWorn).toBe(1);
    expect(monsoon.costWornMinor).toBe(5_000);
    expect(monsoon.costIdleMinor).toBe(30_000); // a + c

    const winter = report.seasons.find((s) => s.season === "WINTER")!;
    expect(winter.wears).toBe(1);
    expect(winter.itemsWorn).toBe(1);
    expect(winter.costWornMinor).toBe(10_000);

    expect(report.totalWears).toBe(4);
  });

  it("excludes items created after season end from idle pool", () => {
    const items = [
      { id: "early", costMinor: 1_000, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "late", costMinor: 9_000, createdAt: new Date("2026-08-01T00:00:00Z") },
    ];
    const report = aggregateSeasonRoi({ year: 2026, items, wearLogs: [] });
    const summer = report.seasons.find((s) => s.season === "SUMMER")!;
    expect(summer.itemsIdle).toBe(1);
    expect(summer.costIdleMinor).toBe(1_000);

    const monsoon = report.seasons.find((s) => s.season === "MONSOON")!;
    expect(monsoon.itemsIdle).toBe(2);
    expect(monsoon.costIdleMinor).toBe(10_000);
  });
});
