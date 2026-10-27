import { describe, expect, it } from "vitest";
import {
  buildTravelPack,
  capsuleConstraintsForTrip,
  exportPackChecklist,
  tripNightCount,
} from "./travel-pack.js";
import type { WeatherCtx } from "./weather.js";

const coolRain: WeatherCtx = {
  tempC: 18,
  condition: "rain",
  source: "mock",
  fetchedAt: "2026-08-26T00:00:00.000Z",
};

describe("travel-pack", () => {
  it("counts inclusive trip days/nights", () => {
    expect(tripNightCount("2026-09-01", "2026-09-01")).toBe(1);
    expect(tripNightCount("2026-09-01", "2026-09-03")).toBe(3);
    expect(tripNightCount("2026-09-03", "2026-09-01")).toBe(0);
  });

  it("capsule size scales with nights and respects maxItems", () => {
    const short = capsuleConstraintsForTrip(2);
    expect(short.nights).toBe(2);
    expect(short.perSlot.top).toBe(2);
    expect(short.maxItems).toBeLessThanOrEqual(10);

    const long = capsuleConstraintsForTrip(7, { maxItems: 8, weather: coolRain });
    expect(long.perSlot.outer).toBe(1);
    expect(long.maxItems).toBeLessThanOrEqual(8);
    expect(long.maxItems).toBe(8);
  });

  it("builds packing list within capsule constraints from owned items", () => {
    const wardrobe = [
      { id: "t1", category: "shirt", closetStatus: "ACTIVE" as const, brand: "A" },
      { id: "t2", category: "tee", closetStatus: "ACTIVE" as const, brand: "B" },
      { id: "t3", category: "blouse", closetStatus: "STORED" as const, brand: "C" },
      { id: "b1", category: "jeans", closetStatus: "ACTIVE" as const, brand: null },
      { id: "b2", category: "chinos", closetStatus: "ACTIVE" as const, brand: null },
      { id: "s1", category: "sneakers", closetStatus: "ACTIVE" as const, brand: null },
      { id: "o1", category: "rain jacket", closetStatus: "ACTIVE" as const, brand: null },
    ];
    const pack = buildTravelPack(wardrobe, {
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      weather: coolRain,
      maxItems: 6,
    });
    expect(pack.nights).toBe(3);
    expect(pack.items.length).toBeLessThanOrEqual(6);
    expect(pack.items.length).toBeGreaterThan(0);
    expect(pack.items.every((i) => i.id !== "t3")).toBe(true); // stored excluded when active exist
    expect(pack.items.some((i) => i.slot === "outer")).toBe(true);
    expect(pack.checklist).toContain("Travel pack");
    expect(pack.checklist).toContain("- [ ]");
  });

  it("exportPackChecklist formats markdown checkboxes", () => {
    const text = exportPackChecklist(
      [
        {
          id: "1",
          category: "shirt",
          brand: "Uniqlo",
          slot: "top",
          reason: "Capsule top",
          checked: false,
        },
      ],
      { startDate: "2026-09-01", endDate: "2026-09-02", nights: 2 },
    );
    expect(text).toContain("Uniqlo · shirt");
    expect(text).toMatch(/^- \[ \]/m);
  });
});
