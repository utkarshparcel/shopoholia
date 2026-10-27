import { describe, expect, it } from "vitest";
import { weekDayKeys } from "./outfit-week.js";
import {
  isWorkwearItem,
  planWorkwearRotation,
  rotationIsUnique,
  WORKWEAR_TAG,
} from "./workwear-rotation.js";

describe("workwear-rotation", () => {
  it("detects workwear via tag and category heuristic", () => {
    expect(isWorkwearItem({ id: "1", category: "tee", tags: [WORKWEAR_TAG] })).toBe(true);
    expect(isWorkwearItem({ id: "2", category: "blazer", tags: [] })).toBe(true);
    expect(isWorkwearItem({ id: "3", category: "graphic tee", tags: [] })).toBe(false);
  });

  it("plans weekday outfits with unique item rotation", () => {
    const wardrobe = [
      { id: "top1", category: "dress shirt", tags: [WORKWEAR_TAG] },
      { id: "top2", category: "oxford shirt", tags: [WORKWEAR_TAG] },
      { id: "top3", category: "polo", tags: [WORKWEAR_TAG] },
      { id: "top4", category: "blouse", tags: [WORKWEAR_TAG] },
      { id: "top5", category: "formal shirt", tags: [WORKWEAR_TAG] },
      { id: "bot1", category: "trousers", tags: [WORKWEAR_TAG] },
      { id: "bot2", category: "chinos", tags: [WORKWEAR_TAG] },
      { id: "bot3", category: "formal pants", tags: [WORKWEAR_TAG] },
      { id: "bot4", category: "trousers", tags: [WORKWEAR_TAG] },
      { id: "bot5", category: "chinos", tags: [WORKWEAR_TAG] },
      { id: "shoe1", category: "loafers", tags: [WORKWEAR_TAG] },
      { id: "shoe2", category: "oxford shoes", tags: [WORKWEAR_TAG] },
      { id: "shoe3", category: "loafers", tags: [WORKWEAR_TAG] },
      { id: "shoe4", category: "dress shoes", tags: [WORKWEAR_TAG] },
      { id: "shoe5", category: "loafers", tags: [WORKWEAR_TAG] },
      { id: "casual", category: "graphic tee", tags: [] },
    ];
    const days = weekDayKeys({ weekStart: "2026-08-24" }); // Mon 24 Aug 2026
    const plans = planWorkwearRotation(wardrobe, days, { piecesPerDay: 3 });
    expect(plans.length).toBe(5);
    expect(plans.every((p) => p.occasion === "WORK")).toBe(true);
    expect(plans.every((p) => ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday))).toBe(true);
    expect(plans.every((p) => !p.itemIds.includes("casual"))).toBe(true);
    expect(rotationIsUnique(plans)).toBe(true);
  });

  it("skips weekends in rotation", () => {
    const wardrobe = [
      { id: "a", category: "dress shirt", tags: [WORKWEAR_TAG] },
      { id: "b", category: "trousers", tags: [WORKWEAR_TAG] },
      { id: "c", category: "loafers", tags: [WORKWEAR_TAG] },
    ];
    const days = weekDayKeys({ weekStart: "2026-08-24" });
    const plans = planWorkwearRotation(wardrobe, days);
    expect(plans.some((p) => p.weekday === "Sat" || p.weekday === "Sun")).toBe(false);
  });
});
