import { describe, expect, it } from "vitest";
import {
  isActiveClosetItem,
  itemMatchesSeason,
  planSeasonalSwap,
  preferActiveCloset,
  seasonTag,
  withSeasonTag,
} from "./seasonal-swap.js";

describe("seasonal-swap", () => {
  it("filters STORED pieces when ACTIVE remain", () => {
    const pool = [
      { id: "a", closetStatus: "ACTIVE" as const, tags: ["season:summer"] },
      { id: "b", closetStatus: "STORED" as const, tags: ["season:winter"] },
      { id: "c", closetStatus: "ACTIVE" as const, tags: [] },
    ];
    const result = preferActiveCloset(pool);
    expect(result.applied).toBe(true);
    expect(result.storedCount).toBe(1);
    expect(result.pool.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("falls back when every piece is STORED", () => {
    const pool = [
      { id: "a", closetStatus: "STORED" as const },
      { id: "b", closetStatus: "STORED" as const },
    ];
    const result = preferActiveCloset(pool);
    expect(result.applied).toBe(false);
    expect(result.pool).toHaveLength(2);
  });

  it("treats missing closetStatus as ACTIVE", () => {
    expect(isActiveClosetItem({ id: "x" })).toBe(true);
  });

  it("bulk swaps: activate target season, store other seasons, keep year-round", () => {
    const items = [
      { id: "summer-tee", tags: [seasonTag("summer")] },
      { id: "winter-coat", tags: [seasonTag("winter")] },
      { id: "jeans", tags: [] as string[] },
      { id: "monsoon-rain", tags: [seasonTag("monsoon")] },
    ];
    const patches = planSeasonalSwap(items, "summer");
    expect(patches).toEqual([
      { id: "summer-tee", closetStatus: "ACTIVE" },
      { id: "winter-coat", closetStatus: "STORED" },
      { id: "jeans", closetStatus: "ACTIVE" },
      { id: "monsoon-rain", closetStatus: "STORED" },
    ]);
  });

  it("itemMatchesSeason: year-round matches any season", () => {
    expect(itemMatchesSeason({ id: "1", tags: [] }, "winter")).toBe(true);
    expect(itemMatchesSeason({ id: "2", tags: ["season:summer"] }, "winter")).toBe(false);
    expect(itemMatchesSeason({ id: "3", tags: ["season:summer"] }, "summer")).toBe(true);
  });

  it("withSeasonTag replaces prior season tags", () => {
    expect(withSeasonTag(["workwear", "season:winter"], "summer")).toEqual([
      "workwear",
      "season:summer",
    ]);
  });
});
