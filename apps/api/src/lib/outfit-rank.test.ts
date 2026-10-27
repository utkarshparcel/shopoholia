import { describe, expect, it } from "vitest";
import {
  buildWhyThis,
  isItemClean,
  pickOutfitSlice,
  rankWardrobeItems,
  wornBlockedIds,
} from "./outfit-rank.js";
import type { WeatherCtx } from "./weather.js";

const weather: WeatherCtx = {
  tempC: 28,
  condition: "sunny",
  source: "api",
  fetchedAt: "2026-08-26T10:00:00.000Z",
};

function item(
  id: string,
  category: string,
  opts: { colors?: string[]; laundry?: string; createdAt?: string } = {},
) {
  return {
    id,
    category,
    colors: opts.colors ?? [],
    laundryStatus: opts.laundry ?? "CLEAN",
    createdAt: new Date(opts.createdAt ?? "2026-01-01T00:00:00.000Z"),
  };
}

describe("outfit-rank", () => {
  it("isItemClean treats DIRTY / IN_LAUNDRY as unclean", () => {
    expect(isItemClean(item("a", "tee", { laundry: "CLEAN" }))).toBe(true);
    expect(isItemClean(item("b", "tee", { laundry: "DIRTY" }))).toBe(false);
    expect(isItemClean(item("c", "tee", { laundry: "IN_LAUNDRY" }))).toBe(false);
  });

  it("ranking is stable for equal scores (createdAt asc)", () => {
    const items = [
      item("00000000-0000-4000-8000-000000000002", "shirt", {
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
      item("00000000-0000-4000-8000-000000000001", "shirt", {
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      item("00000000-0000-4000-8000-000000000003", "shirt", {
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    const a = rankWardrobeItems({ items, weather });
    const b = rankWardrobeItems({ items, weather });
    expect(a.scored.map((s) => s.item.id)).toEqual(b.scored.map((s) => s.item.id));
    expect(a.scored.map((s) => s.item.id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });

  it("taste tags and wear count raise score deterministically", () => {
    const items = [
      item("t1", "jeans", { colors: ["blue"] }),
      item("t2", "kurta", { colors: ["white"] }),
    ];
    const wearCount = new Map([["t2", 4]]);
    const { scored } = rankWardrobeItems({
      items,
      weather,
      styleProfile: { tags: ["jeans", "blue"] },
      wearCount,
    });
    expect(scored[0]!.item.id).toBe("t1"); // tag match beats wear alone
    expect(scored[0]!.score).toBeGreaterThan(scored[1]!.score);
  });

  it("pickOutfitSlice returns disjoint alternatives by altIndex", () => {
    const items = [
      item("a", "top"),
      item("b", "bottom"),
      item("c", "shoes"),
      item("d", "layer"),
      item("e", "hat"),
      item("f", "bag"),
    ];
    const { scored } = rankWardrobeItems({ items, weather });
    const primary = pickOutfitSlice(scored, { altIndex: 0, pickCount: 3 });
    const alt1 = pickOutfitSlice(scored, { altIndex: 1, pickCount: 3 });
    expect(primary.selected.map((s) => s.id)).toHaveLength(3);
    expect(alt1.selected.map((s) => s.id)).toHaveLength(3);
    const primaryIds = new Set(primary.selected.map((s) => s.id));
    for (const s of alt1.selected) {
      expect(primaryIds.has(s.id)).toBe(false);
    }
    expect(primary.hasMore).toBe(true);
    expect(alt1.hasMore).toBe(false);
  });

  it("excludes worn-blocked ids from slice", () => {
    const items = [item("a", "top"), item("b", "bottom"), item("c", "shoes")];
    const { scored } = rankWardrobeItems({
      items,
      weather,
      blockedIds: new Set(["a"]),
    });
    const slice = pickOutfitSlice(scored, {
      altIndex: 0,
      pickCount: 2,
      excludeIds: new Set(["a"]),
    });
    expect(slice.selected.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("wornBlockedIds collects recent wear logs", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const blocked = wornBlockedIds(
      [
        {
          wardrobeItemId: "x",
          wornOn: new Date("2026-08-26T10:00:00.000Z"),
        },
        {
          wardrobeItemId: null,
          outfitItemIds: ["y", "z"],
          wornOn: new Date("2026-08-26T11:00:00.000Z"),
        },
        {
          wardrobeItemId: "old",
          wornOn: new Date("2026-08-20T10:00:00.000Z"),
        },
      ],
      now,
    );
    expect([...blocked].sort()).toEqual(["x", "y", "z"]);
  });

  it("buildWhyThis marks alternative index", () => {
    const why = buildWhyThis({
      whyHints: [],
      selected: [item("a", "tee")],
      weather,
      altIndex: 2,
    });
    expect(why.some((s) => /Alternative look #3/.test(s))).toBe(true);
  });
});
