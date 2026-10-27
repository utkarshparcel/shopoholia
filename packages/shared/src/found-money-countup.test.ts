import { describe, expect, it } from "vitest";
import { formatMinor } from "./money.js";
import {
  FOUND_MONEY_COUNTUP_DURATION_MS,
  countUpEase,
  countUpMinor,
  countUpProgress,
  formatCountUpFrame,
  foundMoneyCountUpPlan,
  shouldSkipFoundMoneyCountUp,
} from "./found-money-countup.js";

describe("found-money count-up (W012)", () => {
  it("skips under Reduce Motion", () => {
    expect(shouldSkipFoundMoneyCountUp(true)).toBe(true);
    expect(shouldSkipFoundMoneyCountUp(false)).toBe(false);
  });

  it("eases and interpolates minor units", () => {
    expect(countUpEase(0)).toBe(0);
    expect(countUpEase(1)).toBe(1);
    expect(countUpEase(0.5)).toBeGreaterThan(0.5);
    expect(countUpMinor(0, 1000, 0)).toBe(0);
    expect(countUpMinor(0, 1000, 1)).toBe(1000);
    expect(countUpMinor(0, 1000, 0.5)).toBe(500);
  });

  it("progress reaches 1 at duration", () => {
    expect(countUpProgress(0)).toBe(0);
    expect(countUpProgress(FOUND_MONEY_COUNTUP_DURATION_MS)).toBe(1);
    expect(countUpProgress(10_000, 100)).toBe(1);
  });

  it("formats frames with formatMinor", () => {
    const mid = formatCountUpFrame(0, 12_34_00, 1, "INR", "en-IN");
    expect(mid).toBe(formatMinor(12_34_00, "INR", "en-IN"));
    expect(formatCountUpFrame(0, 1000, 0, "USD")).toBe(
      formatMinor(0, "USD", "en-US"),
    );
  });

  it("plan jumps to final label when reduce motion or already played", () => {
    const reduced = foundMoneyCountUpPlan({
      toMinor: 5000,
      reduceMotion: true,
      alreadyPlayedThisSession: false,
      currency: "INR",
    });
    expect(reduced.animate).toBe(false);
    expect(reduced.finalLabel).toBe(formatMinor(5000, "INR", "en-IN"));

    const once = foundMoneyCountUpPlan({
      toMinor: 5000,
      reduceMotion: false,
      alreadyPlayedThisSession: true,
    });
    expect(once.animate).toBe(false);

    const animate = foundMoneyCountUpPlan({
      toMinor: 5000,
      fromMinor: 0,
      reduceMotion: false,
      alreadyPlayedThisSession: false,
      currency: "GBP",
    });
    expect(animate.animate).toBe(true);
    expect(animate.durationMs).toBe(FOUND_MONEY_COUNTUP_DURATION_MS);
    expect(animate.finalLabel).toBe(formatMinor(5000, "GBP", "en-GB"));
  });
});
