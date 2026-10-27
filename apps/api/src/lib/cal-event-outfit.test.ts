import { describe, expect, it } from "vitest";
import {
  CAL_EVENT_REMINDER_LOCAL_HOUR,
  computeNightBeforeReminder,
  mapCalendarEventToOccasion,
  planOutfitFromCalendarEvent,
  plannedForFromEvent,
} from "./cal-event-outfit.js";

describe("mapCalendarEventToOccasion", () => {
  it("maps interview titles to FORMAL", () => {
    const r = mapCalendarEventToOccasion({
      title: "Onsite interview with Acme",
      startAt: "2026-09-02T10:00:00.000Z",
    });
    expect(r.occasion).toBe("FORMAL");
    expect(r.reason).toMatch(/interview/i);
    expect(r.plannedFor).toBe("2026-09-02");
  });

  it("maps wedding / shaadi to FORMAL", () => {
    expect(
      mapCalendarEventToOccasion({
        title: "Riya & Aarav wedding",
        startAt: "2026-11-14T16:00:00.000Z",
      }).occasion,
    ).toBe("FORMAL");
    expect(
      mapCalendarEventToOccasion({
        title: "Cousin shaadi reception",
        startAt: "2026-11-15T18:00:00.000Z",
      }).occasion,
    ).toBe("FORMAL");
  });

  it("maps office / meeting to WORK", () => {
    expect(
      mapCalendarEventToOccasion({
        title: "Office standup",
        startAt: "2026-08-27T04:00:00.000Z",
      }).occasion,
    ).toBe("WORK");
  });

  it("maps gym / workout to SPORT", () => {
    expect(
      mapCalendarEventToOccasion({
        title: "Gym — legs",
        startAt: "2026-08-27T12:00:00.000Z",
      }).occasion,
    ).toBe("SPORT");
  });

  it("maps flight / travel to TRAVEL", () => {
    expect(
      mapCalendarEventToOccasion({
        title: "Flight BOM → BLR",
        startAt: "2026-09-01T03:00:00.000Z",
      }).occasion,
    ).toBe("TRAVEL");
  });

  it("maps party keywords to PARTY", () => {
    expect(
      mapCalendarEventToOccasion({
        title: "Birthday party",
        startAt: "2026-08-29T14:00:00.000Z",
      }).occasion,
    ).toBe("PARTY");
  });

  it("uses weekday daytime heuristic when title is empty", () => {
    // Wed 2026-08-26 10:00 UTC
    const r = mapCalendarEventToOccasion({
      title: "",
      startAt: "2026-08-26T10:00:00.000Z",
    });
    expect(r.occasion).toBe("WORK");
    expect(r.reason).toMatch(/weekday/i);
  });

  it("uses evening heuristic → PARTY when no keywords", () => {
    const r = mapCalendarEventToOccasion({
      title: "Catch up",
      startAt: "2026-08-29T19:30:00.000Z", // Sat evening
    });
    expect(r.occasion).toBe("PARTY");
  });

  it("defaults to CASUAL for vague weekend daytime titles", () => {
    const r = mapCalendarEventToOccasion({
      title: "Something",
      startAt: "2026-08-30T11:00:00.000Z", // Sun late morning UTC
    });
    expect(r.occasion).toBe("CASUAL");
  });
});

describe("plannedForFromEvent", () => {
  it("returns YYYY-MM-DD from ISO start", () => {
    expect(plannedForFromEvent("2026-09-03T23:15:00.000Z")).toBe("2026-09-03");
  });
});

describe("computeNightBeforeReminder", () => {
  it("schedules evening before the event", () => {
    const rem = computeNightBeforeReminder("2026-09-05T10:00:00.000Z", {
      now: new Date("2026-09-01T08:00:00.000Z"),
      hour: CAL_EVENT_REMINDER_LOCAL_HOUR,
    });
    expect(rem).not.toBeNull();
    expect(rem!.remindAt.toISOString()).toBe("2026-09-04T20:00:00.000Z");
    expect(rem!.delayMs).toBeGreaterThan(0);
  });

  it("returns null when reminder window already passed", () => {
    const rem = computeNightBeforeReminder("2026-09-05T10:00:00.000Z", {
      now: new Date("2026-09-05T08:00:00.000Z"),
    });
    expect(rem).toBeNull();
  });
});

describe("planOutfitFromCalendarEvent", () => {
  it("includes optional remindAt when remindNightBefore is set", () => {
    const plan = planOutfitFromCalendarEvent(
      {
        id: "evt-1",
        title: "Interview at Stripe",
        startAt: "2026-09-10T09:00:00.000Z",
      },
      { now: new Date("2026-09-01T00:00:00.000Z"), remindNightBefore: true },
    );
    expect(plan.occasion).toBe("FORMAL");
    expect(plan.plannedFor).toBe("2026-09-10");
    expect(plan.remindAt).toBe("2026-09-09T20:00:00.000Z");
    expect(plan.eventId).toBe("evt-1");
  });

  it("omits remindAt when optional flag is off", () => {
    const plan = planOutfitFromCalendarEvent(
      { title: "Office", startAt: "2026-09-10T09:00:00.000Z" },
      { remindNightBefore: false },
    );
    expect(plan.remindAt).toBeNull();
    expect(plan.occasion).toBe("WORK");
  });
});
