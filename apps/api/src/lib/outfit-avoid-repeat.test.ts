import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVOID_REPEAT_DAYS,
  applyAvoidRepeat,
  recentlyWornItemIds,
} from "./outfit-avoid-repeat.js";

describe("recentlyWornItemIds", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("collects direct wardrobe wears inside the window", () => {
    const worn = recentlyWornItemIds(
      [
        { wardrobeItemId: "a", wornOn: "2026-08-24T12:00:00.000Z" },
        { wardrobeItemId: "b", wornOn: "2026-08-01T12:00:00.000Z" },
      ],
      { now, days: DEFAULT_AVOID_REPEAT_DAYS },
    );
    expect([...worn]).toEqual(["a"]);
  });

  it("expands outfit-linked wear logs when outfits are provided", () => {
    const worn = recentlyWornItemIds(
      [{ outfitId: "out-1", wornOn: now }],
      {
        now,
        outfits: [{ id: "out-1", itemIds: ["x", "y"] }],
      },
    );
    expect(worn.has("x")).toBe(true);
    expect(worn.has("y")).toBe(true);
  });

  it("ignores invalid wornOn timestamps", () => {
    const worn = recentlyWornItemIds([{ wardrobeItemId: "z", wornOn: "not-a-date" }], {
      now,
    });
    expect(worn.size).toBe(0);
  });
});

describe("applyAvoidRepeat", () => {
  it("filters recently worn when alternatives remain", () => {
    const result = applyAvoidRepeat(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      new Set(["a", "b"]),
    );
    expect(result.pool.map((p) => p.id)).toEqual(["c"]);
    expect(result.excludedCount).toBe(2);
    expect(result.applied).toBe(true);
  });

  it("falls back to the full pool when exclusion would empty it", () => {
    const pool = [{ id: "a" }, { id: "b" }];
    const result = applyAvoidRepeat(pool, new Set(["a", "b"]));
    expect(result.pool).toEqual(pool);
    expect(result.applied).toBe(false);
    expect(result.excludedCount).toBe(0);
  });

  it("is a no-op when nothing was recently worn", () => {
    const pool = [{ id: "a" }];
    expect(applyAvoidRepeat(pool, new Set())).toEqual({
      pool,
      excludedCount: 0,
      applied: false,
    });
  });
});
