import { describe, it, expect } from "vitest";
import { computeNextOccasion, indianFestivalDates, multiDayOccasionSpan } from "./festivals.js";

describe("festivals", () => {
  it("returns upcoming IN festival seeds", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    const list = indianFestivalDates({ from });
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((f) => f.label === "Diwali")).toBe(true);
    expect(list.every((f) => new Date(f.date).getTime() >= from.getTime() - 86_400_000)).toBe(true);
  });

  it("computes daysUntil for the soonest occasion", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const next = computeNextOccasion(
      [
        { occasion: "BIRTHDAY", date: "2026-09-01T00:00:00.000Z", label: "Birthday" },
        { occasion: "FESTIVAL", date: "2026-11-08T00:00:00.000Z", label: "Diwali" },
      ],
      now,
    );
    expect(next).not.toBeNull();
    expect(next!.label).toBe("Birthday");
    expect(next!.daysUntil).toBe(6);
  });

  it("rolls birthday into next year when past", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const next = computeNextOccasion(
      [{ occasion: "BIRTHDAY", date: "2020-03-01T00:00:00.000Z", label: "Birthday" }],
      now,
    );
    expect(next).not.toBeNull();
    expect(next!.daysUntil).toBeGreaterThan(100);
    expect(new Date(next!.date).getUTCFullYear()).toBe(2027);
  });

  it("builds multi-day wedding / festival spans (N39)", () => {
    const wedding = multiDayOccasionSpan({
      kind: "wedding",
      label: "Shaadi",
      primaryDate: "2026-12-12",
    });
    expect(wedding.dayCount).toBe(3);
    expect(wedding.startDate).toBe("2026-12-10");
    expect(wedding.endDate).toBe("2026-12-12");

    const diwali = multiDayOccasionSpan({
      kind: "festival",
      label: "Diwali",
      primaryDate: "2026-11-08T00:00:00.000Z",
    });
    expect(diwali.dayCount).toBe(2);
    expect(diwali.startDate).toBe("2026-11-07");
    expect(diwali.endDate).toBe("2026-11-08");
  });
});
