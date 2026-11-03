import { describe, expect, it } from "vitest";
import { emiDaysUntilDue, buildEmiDontMissCard } from "./emi.js";
import { detectEmiSignal } from "./emi-detect.js";
import { giftOccasionPushCopy } from "./gift-occasion-push.js";
import { computeRewearStreak } from "./rewear-streak.js";

const IST = "Asia/Kolkata";
// 01:00 IST on 3 Nov 2026 is still 2 Nov in UTC.
const EARLY_IST = new Date("2026-11-02T19:30:00.000Z");

describe("Closet day counts use the user's local day", () => {
  it("rewear streak keys a wear to its local day", () => {
    const streak = computeRewearStreak({
      wearDates: [EARLY_IST],
      now: new Date("2026-11-03T04:30:00.000Z"), // 10:00 IST, 3 Nov
      timeZone: IST,
    });
    expect(streak.todayLogged).toBe(true);
    expect(computeRewearStreak({ wearDates: [EARLY_IST], now: new Date("2026-11-03T04:30:00.000Z") }).todayLogged).toBe(
      false,
    );
  });

  it("EMI days count from the local today", () => {
    expect(emiDaysUntilDue("2026-11-03", EARLY_IST, IST)).toBe(0);
    expect(emiDaysUntilDue("2026-11-03", EARLY_IST)).toBe(1);
    const card = buildEmiDontMissCard({
      id: "p1",
      provider: "Simpl",
      installmentMinor: 100,
      remainingMinor: 300,
      nextDueOn: "2026-11-03",
      now: EARLY_IST,
      timeZone: IST,
    });
    expect(card?.daysUntilDue).toBe(0);
  });

  it("'due today' in an EMI SMS is the local day", () => {
    const sms = "Your Simpl EMI of Rs 1,000 is due today.";
    expect(detectEmiSignal("SMS", sms, EARLY_IST, IST)?.nextDueOn).toBe("2026-11-03");
    expect(detectEmiSignal("SMS", "Your Simpl EMI of Rs 1,000 is due tomorrow.", EARLY_IST, IST)?.nextDueOn).toBe(
      "2026-11-04",
    );
  });

  it("gift countdown counts from the local today", () => {
    const copy = giftOccasionPushCopy({
      occasion: "BIRTHDAY",
      date: "2026-11-04T00:00:00.000Z",
      now: EARLY_IST,
      timeZone: IST,
    });
    expect(copy.title).toMatch(/^1 day to /);
  });
});
