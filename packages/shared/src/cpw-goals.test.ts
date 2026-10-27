import { describe, expect, it } from "vitest";
import {
  cpwGoalCelebrateCopy,
  cpwGoalNudgeCopy,
  cpwGoalProgress,
  wearsNeededForTargetCpw,
} from "./cpw-goals.js";

describe("cpw goal math (N41-CPW-GOALS)", () => {
  it("computes wears needed as ceil(cost / target)", () => {
    // ₹5,000 item → ₹500/wear needs 10 wears
    expect(wearsNeededForTargetCpw(500_000, 50_000)).toBe(10);
    // ₹1,000 → ₹300/wear needs ceil(1000/300) = 4
    expect(wearsNeededForTargetCpw(100_000, 30_000)).toBe(4);
    expect(wearsNeededForTargetCpw(0, 50_000)).toBe(0);
    expect(wearsNeededForTargetCpw(100_000, 0)).toBe(0);
  });

  it("tracks progress toward target CPW", () => {
    // cost 500000, target 50000 → 10 wears
    expect(cpwGoalProgress(500_000, 0, 50_000)).toMatchObject({
      active: true,
      targetCpwMinor: 50_000,
      currentCpwMinor: 500_000,
      wearsNeeded: 10,
      progress: 0,
      remaining: 10,
      completed: false,
      label: "0/10 wears to target CPW",
    });

    expect(cpwGoalProgress(500_000, 3, 50_000)).toMatchObject({
      currentCpwMinor: Math.round(500_000 / 3),
      progress: 3,
      remaining: 7,
      completed: false,
      label: "3/10 wears to target CPW",
    });

    expect(cpwGoalProgress(500_000, 10, 50_000)).toMatchObject({
      currentCpwMinor: 50_000,
      progress: 10,
      remaining: 0,
      completed: true,
      label: "Goal hit — CPW at target",
    });

    expect(cpwGoalProgress(500_000, 12, 50_000)).toMatchObject({
      completed: true,
      progress: 10,
      remaining: 0,
    });
  });

  it("inactive when no target set", () => {
    expect(cpwGoalProgress(100_000, 2, null)).toMatchObject({
      active: false,
      targetCpwMinor: null,
      completed: false,
      label: "No CPW goal",
      currentCpwMinor: 50_000,
    });
    expect(cpwGoalProgress(100_000, 2, 0).active).toBe(false);
  });

  it("nudge + celebrate copy", () => {
    const zero = cpwGoalProgress(500_000, 0, 50_000);
    expect(cpwGoalNudgeCopy(zero, "navy shirt")).toMatch(/Wear navy shirt 10×/);
    expect(cpwGoalNudgeCopy(zero, "navy shirt")).toMatch(/\/wear/);
    expect(cpwGoalNudgeCopy(zero)).toMatch(/Wear it 10×/);

    const mid = cpwGoalProgress(500_000, 7, 50_000);
    expect(cpwGoalNudgeCopy(mid)).toMatch(/7\/10 wears/);
    expect(cpwGoalNudgeCopy(mid)).toMatch(/3 to go/);

    const done = cpwGoalProgress(500_000, 10, 50_000);
    expect(cpwGoalNudgeCopy(done, "navy shirt")).toMatch(/navy shirt/);
    expect(cpwGoalCelebrateCopy("kurta")).toMatch(/kurta/);
    expect(cpwGoalCelebrateCopy("kurta", "INR", 50_000)).toMatch(/\/wear/);
    expect(cpwGoalCelebrateCopy(null)).toMatch(/that piece/);

    const inactive = cpwGoalProgress(100_000, 2, null);
    expect(cpwGoalNudgeCopy(inactive, "jeans")).toBe("Set a cost-per-wear goal for jeans.");
    expect(cpwGoalNudgeCopy(inactive)).toBe("Set a cost-per-wear goal.");
  });

  it("labels CPW goal set when wearsNeeded is 0 with active target edge", () => {
    expect(cpwGoalProgress(0, 0, 50_000)).toMatchObject({
      active: true,
      wearsNeeded: 0,
      label: "CPW goal set",
    });
  });
});
