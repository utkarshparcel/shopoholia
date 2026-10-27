import { describe, expect, it } from "vitest";
import {
  computeRewearStreak,
  isRewearStreakMilestone,
  rewearStreakCelebrateCopy,
  rewearStreakLabel,
  rewearStreakNudgeCopy,
  toUtcDateKey,
} from "./rewear-streak.js";

function day(offsetFromToday: number, now = new Date("2026-08-26T15:00:00.000Z")): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + offsetFromToday);
  return `${toUtcDateKey(d)}T12:00:00.000Z`;
}

describe("computeRewearStreak", () => {
  const now = new Date("2026-08-26T15:00:00.000Z");

  it("counts consecutive days with rewear ending today", () => {
    const streak = computeRewearStreak({
      wearDates: [day(-2, now), day(-1, now), day(0, now)],
      now,
    });
    expect(streak).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
      todayLogged: true,
      lastWearOn: "2026-08-26",
      brokenByPurchase: false,
      label: "3-day rewear streak",
    });
  });

  it("keeps yesterday grace when today not logged", () => {
    const streak = computeRewearStreak({
      wearDates: [day(-2, now), day(-1, now)],
      now,
    });
    expect(streak.currentStreak).toBe(2);
    expect(streak.todayLogged).toBe(false);
    expect(streak.lastWearOn).toBe("2026-08-25");
  });

  it("breaks current streak after a gap", () => {
    const streak = computeRewearStreak({
      wearDates: [day(-5, now), day(-4, now), day(-1, now)],
      now,
    });
    expect(streak.currentStreak).toBe(1);
    expect(streak.longestStreak).toBe(2);
  });

  it("returns zero when no wears", () => {
    expect(computeRewearStreak({ wearDates: [], now })).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      todayLogged: false,
      lastWearOn: null,
      label: "No rewear streak yet",
    });
  });

  it("optionally breaks on new purchase (resets window after buy)", () => {
    const withoutBreak = computeRewearStreak({
      wearDates: [day(-3, now), day(-2, now), day(-1, now), day(0, now)],
      purchaseDates: [day(-2, now)],
      breakOnPurchase: false,
      now,
    });
    expect(withoutBreak.currentStreak).toBe(4);

    const withBreak = computeRewearStreak({
      wearDates: [day(-3, now), day(-2, now), day(-1, now), day(0, now)],
      purchaseDates: [day(-2, now)],
      breakOnPurchase: true,
      now,
    });
    // Purchase on day -2 → only wears on -1 and 0 count
    expect(withBreak.currentStreak).toBe(2);
    expect(withBreak.brokenByPurchase).toBe(true);
    expect(withBreak.longestStreak).toBe(2);
  });

  it("purchase with no later wears zeroes the streak", () => {
    const streak = computeRewearStreak({
      wearDates: [day(-3, now), day(-2, now)],
      purchaseDates: [day(-1, now)],
      breakOnPurchase: true,
      now,
    });
    expect(streak.currentStreak).toBe(0);
    expect(streak.brokenByPurchase).toBe(true);
  });

  it("dedupes multiple wears on the same day", () => {
    const streak = computeRewearStreak({
      wearDates: [
        "2026-08-26T08:00:00.000Z",
        "2026-08-26T20:00:00.000Z",
        "2026-08-25T10:00:00.000Z",
      ],
      now,
    });
    expect(streak.currentStreak).toBe(2);
    expect(streak.todayLogged).toBe(true);
  });
});

describe("rewear streak copy + milestones", () => {
  it("labels and nudges", () => {
    expect(rewearStreakLabel(0)).toBe("No rewear streak yet");
    expect(rewearStreakLabel(1)).toBe("1-day rewear streak");
    expect(rewearStreakCelebrateCopy(7)).toMatch(/7-day/);
    const active = computeRewearStreak({
      wearDates: [day(-1), day(0)],
      now: new Date("2026-08-26T15:00:00.000Z"),
    });
    expect(rewearStreakNudgeCopy(active)).toMatch(/keep rewearing/i);
    const atRisk = computeRewearStreak({
      wearDates: [day(-1)],
      now: new Date("2026-08-26T15:00:00.000Z"),
    });
    expect(rewearStreakNudgeCopy(atRisk)).toMatch(/log a wear today/i);
    expect(
      rewearStreakNudgeCopy({
        currentStreak: 0,
        longestStreak: 0,
        todayLogged: false,
        lastWearOn: null,
        brokenByPurchase: false,
        label: "No rewear streak yet",
      }),
    ).toMatch(/start a rewear streak/i);
  });

  it("flags celebrate milestones", () => {
    expect(isRewearStreakMilestone(3)).toBe(true);
    expect(isRewearStreakMilestone(2)).toBe(false);
    expect(isRewearStreakMilestone(7)).toBe(true);
  });
});
