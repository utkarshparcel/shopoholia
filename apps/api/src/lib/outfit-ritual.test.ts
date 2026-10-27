import { describe, expect, it } from "vitest";
import {
  applyAvoidRepeat,
  DEFAULT_AVOID_REPEAT_DAYS,
  recentlyWornItemIds,
} from "./outfit-avoid-repeat.js";
import {
  categorySlot,
  companionSlots,
  goesWithScore,
  rankGoesWith,
} from "./outfit-goes-with.js";
import { mondayOfWeek, toDateKey, weekDayKeys } from "./outfit-week.js";
import {
  shouldRerollOutfitForWeather,
  weatherShiftExceedsThreshold,
  WEATHER_REROLL_TEMP_DELTA_C,
} from "./weather-reroll.js";

describe("avoid-repeat", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");

  it("collects items worn within default N days", () => {
    const worn = recentlyWornItemIds(
      [
        { wardrobeItemId: "a", wornOn: new Date("2026-08-25T12:00:00.000Z") },
        { wardrobeItemId: "b", wornOn: new Date("2026-08-10T12:00:00.000Z") },
        { wardrobeItemId: "c", wornOn: new Date("2026-08-20T12:00:00.000Z") },
      ],
      { now, days: DEFAULT_AVOID_REPEAT_DAYS },
    );
    expect(worn.has("a")).toBe(true);
    expect(worn.has("c")).toBe(true);
    expect(worn.has("b")).toBe(false);
  });

  it("expands outfit wear logs to item ids", () => {
    const worn = recentlyWornItemIds(
      [{ outfitId: "o1", wornOn: new Date("2026-08-24T08:00:00.000Z") }],
      {
        now,
        outfits: [{ id: "o1", itemIds: ["x", "y"] }],
      },
    );
    expect([...worn].sort()).toEqual(["x", "y"]);
  });

  it("filters pool and falls back when everything was worn", () => {
    const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const partial = applyAvoidRepeat(pool, new Set(["a", "b"]));
    expect(partial.applied).toBe(true);
    expect(partial.excludedCount).toBe(2);
    expect(partial.pool.map((p) => p.id)).toEqual(["c"]);

    const allWorn = applyAvoidRepeat(pool, new Set(["a", "b", "c"]));
    expect(allWorn.applied).toBe(false);
    expect(allWorn.pool).toHaveLength(3);
  });
});

describe("goes-with ranking", () => {
  it("maps categories to slots", () => {
    expect(categorySlot("blue jeans")).toBe("bottom");
    expect(categorySlot("linen shirt")).toBe("top");
    expect(categorySlot("white sneakers")).toBe("shoes");
    expect(categorySlot("rain jacket")).toBe("outer");
    expect(categorySlot("evening dress")).toBe("dress");
  });

  it("ranks bottoms and shoes above same-slot tops for a shirt", () => {
    const anchor = { id: "1", category: "oxford shirt", colors: ["white"] };
    const ranked = rankGoesWith(anchor, [
      { id: "2", category: "polo tee", colors: ["navy"] },
      { id: "3", category: "dark jeans", colors: ["blue"] },
      { id: "4", category: "leather sneakers", colors: ["white"] },
      { id: "5", category: "rain jacket", colors: ["black"] },
    ]);
    expect(ranked.map((r) => r.id)).not.toContain("2"); // same-slot top excluded
    expect(ranked.map((r) => r.id).slice(0, 2).sort()).toEqual(["3", "4"]); // bottoms + shoes lead
    expect(ranked.some((r) => r.id === "5")).toBe(true);
    expect(companionSlots("top")).toContain("bottom");
  });

  it("scores dress → shoes higher than dress → top", () => {
    const dress = { id: "d", category: "saree", colors: ["red"] };
    const shoes = goesWithScore(dress, { id: "s", category: "heels", colors: ["gold"] });
    const top = goesWithScore(dress, { id: "t", category: "blouse", colors: ["red"] });
    expect(shoes.score).toBeGreaterThan(top.score);
    expect(shoes.reasons.some((r) => /classic/i.test(r))).toBe(true);
  });
});

describe("week calendar helpers", () => {
  it("returns Mon–Sun keys with today flagged", () => {
    // 2026-08-26 is a Wednesday
    const days = weekDayKeys({ now: new Date("2026-08-26T15:00:00.000Z") });
    expect(days).toHaveLength(7);
    expect(days[0]!.weekday).toBe("Mon");
    expect(days[0]!.date).toBe("2026-08-24");
    expect(days[6]!.weekday).toBe("Sun");
    expect(days[6]!.date).toBe("2026-08-30");
    expect(days.find((d) => d.isToday)?.date).toBe("2026-08-26");
  });

  it("mondayOfWeek rolls Sunday back", () => {
    const mon = mondayOfWeek(new Date("2026-08-30T12:00:00.000Z")); // Sunday
    expect(toDateKey(mon)).toBe("2026-08-24");
  });
});

describe("weather reroll threshold", () => {
  it("triggers on temp delta ≥ threshold", () => {
    expect(
      weatherShiftExceedsThreshold(
        { tempC: 28, condition: "sunny" },
        { tempC: 28 + WEATHER_REROLL_TEMP_DELTA_C, condition: "sunny" },
      ),
    ).toBe(true);
    expect(
      weatherShiftExceedsThreshold(
        { tempC: 28, condition: "sunny" },
        { tempC: 30, condition: "sunny" },
      ),
    ).toBe(false);
  });

  it("triggers on rain ↔ dry condition flip", () => {
    expect(
      weatherShiftExceedsThreshold(
        { tempC: 26, condition: "sunny" },
        { tempC: 25, condition: "rain" },
      ),
    ).toBe(true);
  });

  it("only re-rolls before noon", () => {
    const prev = { tempC: 20, condition: "sunny" };
    const next = { tempC: 30, condition: "rain" };
    expect(
      shouldRerollOutfitForWeather({
        prevWeather: prev,
        currentWeather: next,
        now: new Date("2026-08-26T09:00:00"),
      }),
    ).toBe(true);
    expect(
      shouldRerollOutfitForWeather({
        prevWeather: prev,
        currentWeather: next,
        now: new Date("2026-08-26T14:00:00"),
      }),
    ).toBe(false);
  });
});
