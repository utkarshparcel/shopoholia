import { describe, expect, it } from "vitest";
import {
  KG_CO2_PER_REWEAR,
  LITERS_WATER_PER_REWEAR,
  computeCo2WaterSavings,
  formatCo2WaterLabel,
} from "./co2-savings.js";

describe("WV05-CO2 computeCo2WaterSavings", () => {
  it("counts only wears beyond the first per item", () => {
    const s = computeCo2WaterSavings({
      metrics: [{ wearCount: 1 }, { wearCount: 4 }, { wearCount: 0 }],
    });
    // 0 + 3 + 0
    expect(s.rewearCount).toBe(3);
    expect(s.effectiveRewears).toBe(3);
    expect(s.kgCo2Saved).toBe(round1(3 * KG_CO2_PER_REWEAR));
    expect(s.litersWaterSaved).toBe(3 * LITERS_WATER_PER_REWEAR);
    expect(s.label).toMatch(/CO₂/);
    expect(s.label).toMatch(/water saved/);
  });

  it("adds a thin streak-day bonus (0.25 rewear-eq per day)", () => {
    const s = computeCo2WaterSavings({
      metrics: [{ wearCount: 2 }],
      rewearStreakDays: 4,
    });
    // 1 rewear + 4*0.25 = 2 effective
    expect(s.rewearCount).toBe(1);
    expect(s.streakDays).toBe(4);
    expect(s.effectiveRewears).toBe(2);
    expect(s.kgCo2Saved).toBe(round1(2 * KG_CO2_PER_REWEAR));
  });

  it("returns zero label when nothing reworn", () => {
    const s = computeCo2WaterSavings({ metrics: [{ wearCount: 0 }, { wearCount: 1 }] });
    expect(s.rewearCount).toBe(0);
    expect(s.kgCo2Saved).toBe(0);
    expect(s.litersWaterSaved).toBe(0);
    expect(formatCo2WaterLabel(0, 0)).toMatch(/No CO₂/);
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
