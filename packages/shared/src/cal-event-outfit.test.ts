import { describe, expect, it } from "vitest";
import {
  CAL_EVENT_REMINDER_LOCAL_HOUR,
  computeNightBeforeReminder,
  mapCalendarEventToOutfit,
  mapCalendarEventsToOutfits,
  mapEventTitleToOccasion,
  nightBeforeReminderAt,
  occasionFromStartTime,
  plannedForFromEventStart,
  shouldScheduleNightBeforeReminder,
} from "./cal-event-outfit.js";

describe("mapEventTitleToOccasion", () => {
  it("maps interview / wedding / office titles", () => {
    expect(mapEventTitleToOccasion("Final interview at Acme").occasion).toBe("FORMAL");
    expect(mapEventTitleToOccasion("Priya's wedding").occasion).toBe("FORMAL");
    expect(mapEventTitleToOccasion("Office standup").occasion).toBe("WORK");
  });

  it("maps party / sport / travel keywords", () => {
    expect(mapEventTitleToOccasion("Birthday party").occasion).toBe("PARTY");
    expect(mapEventTitleToOccasion("Gym — legs").occasion).toBe("SPORT");
    expect(mapEventTitleToOccasion("Flight to DEL").occasion).toBe("TRAVEL");
  });

  it("falls back to time heuristics when title is vague", () => {
    expect(mapEventTitleToOccasion("Catch up", "2026-08-26T10:00:00.000Z").occasion).toBe("WORK");
    expect(mapEventTitleToOccasion("Something", "2026-08-29T19:00:00.000Z").occasion).toBe("PARTY");
    expect(mapEventTitleToOccasion("Something", "2026-08-30T14:00:00.000Z").occasion).toBe("CASUAL");
  });
});

describe("occasionFromStartTime", () => {
  it("uses weekday daytime for WORK", () => {
    expect(occasionFromStartTime(new Date("2026-08-26T09:30:00.000Z")).occasion).toBe("WORK");
  });
});

describe("mapCalendarEventToOutfit", () => {
  it("returns plannedFor + occasion + reason", () => {
    const mapped = mapCalendarEventToOutfit({
      id: "evt-1",
      title: "  Client interview  ",
      startAt: "2026-09-01T05:30:00.000Z",
    });
    expect(mapped.eventId).toBe("evt-1");
    expect(mapped.title).toBe("Client interview");
    expect(mapped.plannedFor).toBe("2026-09-01");
    expect(mapped.occasion).toBe("FORMAL");
    expect(mapped.reason).toMatch(/interview/i);
  });

  it("maps a batch of events", () => {
    const batch = mapCalendarEventsToOutfits([
      { title: "Office", startAt: "2026-08-27T09:00:00.000Z" },
      { title: "Gym", startAt: "2026-08-27T18:00:00.000Z" },
    ]);
    expect(batch.map((b) => b.occasion)).toEqual(["WORK", "SPORT"]);
  });

  it("plannedForFromEventStart is YYYY-MM-DD", () => {
    expect(plannedForFromEventStart("2026-08-26T23:15:00.000Z")).toBe("2026-08-26");
    expect(plannedForFromEventStart(new Date("2026-08-26T01:00:00.000Z"))).toBe("2026-08-26");
    // Invalid date → today (UTC)
    expect(plannedForFromEventStart("not-a-date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("defaults to casual when title empty and startAt invalid", () => {
    expect(mapEventTitleToOccasion("", "bogus")).toMatchObject({
      occasion: "CASUAL",
      reason: expect.stringMatching(/default casual/i),
    });
    expect(mapEventTitleToOccasion("Random meetup")).toMatchObject({
      occasion: "CASUAL",
    });
  });
});

describe("night-before reminder", () => {
  it("schedules previous day at default 20:00 UTC", () => {
    const remind = nightBeforeReminderAt("2026-08-27T09:00:00.000Z");
    expect(remind.toISOString()).toBe("2026-08-26T20:00:00.000Z");
    expect(CAL_EVENT_REMINDER_LOCAL_HOUR).toBe(20);
  });

  it("computeNightBeforeReminder returns delay", () => {
    const rem = computeNightBeforeReminder("2026-09-05T10:00:00.000Z", {
      now: new Date("2026-09-01T08:00:00.000Z"),
    });
    expect(rem).not.toBeNull();
    expect(rem!.remindAt.toISOString()).toBe("2026-09-04T20:00:00.000Z");
  });

  it("skips when disabled or already past", () => {
    expect(
      shouldScheduleNightBeforeReminder({
        eventStart: "2026-08-27T09:00:00.000Z",
        enabled: false,
        now: new Date("2026-08-20T00:00:00.000Z"),
      }),
    ).toBe(false);

    expect(
      shouldScheduleNightBeforeReminder({
        eventStart: "2026-08-27T09:00:00.000Z",
        enabled: true,
        now: new Date("2026-08-26T21:00:00.000Z"),
      }),
    ).toBe(false);

    expect(
      shouldScheduleNightBeforeReminder({
        eventStart: "2026-08-27T09:00:00.000Z",
        enabled: true,
        now: new Date("2026-08-20T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});

describe("calendar helpers in the user's time zone", () => {
  const IST = "Asia/Kolkata";

  it("fires the night-before reminder at 20:00 local on the local day before", () => {
    // 10:30 IST on 15 Sep → 20:00 IST on 14 Sep (14:30Z), outside 22:00–07:00 quiet hours.
    expect(nightBeforeReminderAt("2026-09-15T05:00:00.000Z", { timeZone: IST }).toISOString()).toBe(
      "2026-09-14T14:30:00.000Z",
    );
    // 04:45 IST on 4 Sep is 23:15Z on 3 Sep: the night before is still 3 Sep local.
    expect(nightBeforeReminderAt("2026-09-03T23:15:00.000Z", { timeZone: IST }).toISOString()).toBe(
      "2026-09-03T14:30:00.000Z",
    );
    const rem = computeNightBeforeReminder("2026-09-15T05:00:00.000Z", {
      now: new Date("2026-09-14T10:00:00.000Z"),
      timeZone: IST,
    });
    expect(rem?.remindAt.toISOString()).toBe("2026-09-14T14:30:00.000Z");
  });

  it("plans the event on its local day and reads local hours for the occasion", () => {
    expect(plannedForFromEventStart("2026-09-03T23:15:00.000Z", IST)).toBe("2026-09-04");
    // 09:30 IST Monday 2 Nov 2026 is 04:00Z: a work look, not "evening → party".
    expect(occasionFromStartTime(new Date("2026-11-02T04:00:00.000Z"), IST).occasion).toBe("WORK");
    const mapped = mapCalendarEventToOutfit({ title: "Sync", startAt: "2026-11-01T19:00:00.000Z" }, IST);
    expect(mapped.plannedFor).toBe("2026-11-02");
    expect(mapped.occasion).toBe("PARTY"); // 00:30 IST
  });
});
