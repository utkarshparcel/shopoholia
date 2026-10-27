import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  addDaysToKey,
  isInLocalQuietHours,
  isValidTimeZone,
  localDateKey,
  localDayRange,
  localMonthRange,
  localParts,
  nextLocalSendAt,
  resolveTimeZone,
  weekDateKeys,
  weekStartKey,
  zonedTimeToInstant,
} from "./local-time.js";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const LDN = "Europe/London";
const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();
const hours = (r: { start: Date; end: Date }) => (r.end.getTime() - r.start.getTime()) / 3_600_000;

describe("time zone names", () => {
  it("accepts IANA names and rejects everything else", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Asia/Kolkata");
    for (const tz of [IST, NY, LDN, "UTC", "America/Argentina/Buenos_Aires", "Etc/GMT+5"]) {
      expect(isValidTimeZone(tz)).toBe(true);
    }
    for (const tz of ["Mars/Olympus_Mons", "", "  ", "+05:30", "../etc/passwd", "Asia/Kolkata ", 42, null, undefined]) {
      expect(isValidTimeZone(tz)).toBe(false);
    }
    expect(isValidTimeZone("A/" + "b".repeat(70))).toBe(false);
  });

  it("resolves to a valid name or the default", () => {
    expect(resolveTimeZone(NY)).toBe(NY);
    expect(resolveTimeZone(IST)).toBe(IST);
    expect(resolveTimeZone("Asia/Calcutta")).toBe("Asia/Calcutta");
    expect(resolveTimeZone("Mars/Olympus_Mons")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone()).toBe(DEFAULT_TIME_ZONE);
  });

  it("throws on an invalid zone, date key or time instead of guessing", () => {
    expect(() => localDateKey(at("2026-10-26T00:00:00Z"), "Mars/Olympus_Mons")).toThrow(RangeError);
    expect(() => zonedTimeToInstant("2026-10-26", "24:00", IST)).toThrow(RangeError);
    expect(() => zonedTimeToInstant("2026-10-26", "7:00", IST)).toThrow(RangeError);
    expect(() => addDaysToKey("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDaysToKey("26-10-2026", 1)).toThrow(RangeError);
    expect(() => localParts(new Date("nope"), IST)).toThrow(RangeError);
  });
});

describe("Asia/Kolkata days and months", () => {
  it("flips the date at local midnight, not UTC midnight", () => {
    expect(localDateKey(at("2026-10-25T18:29:59.999Z"), IST)).toBe("2026-10-25");
    expect(localDateKey(at("2026-10-25T18:30:00.000Z"), IST)).toBe("2026-10-26");
    expect(localDateKey(at("2026-10-25T18:30:00.000Z").getTime(), IST)).toBe("2026-10-26");
  });

  it("reads local parts with an ISO weekday", () => {
    expect(localParts(at("2026-10-25T18:30:00Z"), IST)).toEqual({
      year: 2026, month: 10, day: 26, hour: 0, minute: 0, weekday: 1,
    });
    expect(localParts(at("2026-11-01T12:00:00Z"), IST).weekday).toBe(7);
  });

  it("gives a 24h day range", () => {
    const r = localDayRange("2026-10-26", IST);
    expect(iso(r.start)).toBe("2026-10-25T18:30:00.000Z");
    expect(iso(r.end)).toBe("2026-10-26T18:30:00.000Z");
    expect(r.dateKey).toBe("2026-10-26");
  });

  it("gives month ranges across month and year ends", () => {
    const jan = localMonthRange(at("2026-01-31T18:29:59.999Z"), IST);
    expect(jan.monthKey).toBe("2026-01");
    expect(iso(jan.start)).toBe("2025-12-31T18:30:00.000Z");
    expect(iso(jan.end)).toBe("2026-01-31T18:30:00.000Z");

    const feb = localMonthRange(at("2026-01-31T18:30:00.000Z"), IST);
    expect(feb.monthKey).toBe("2026-02");
    expect(iso(feb.end)).toBe("2026-02-28T18:30:00.000Z");

    const leapFeb = localMonthRange(at("2028-02-15T00:00:00Z"), IST);
    expect(iso(leapFeb.end)).toBe("2028-02-29T18:30:00.000Z");

    const dec = localMonthRange(at("2026-12-31T18:29:00Z"), IST);
    expect(dec.monthKey).toBe("2026-12");
    expect(iso(dec.end)).toBe("2026-12-31T18:30:00.000Z");
    expect(localMonthRange(at("2026-12-31T18:30:00Z"), IST).monthKey).toBe("2027-01");
  });
});

describe("America/New_York across DST", () => {
  it("spring-forward day (2026-03-08) is 23 hours", () => {
    const r = localDayRange("2026-03-08", NY);
    expect(iso(r.start)).toBe("2026-03-08T05:00:00.000Z");
    expect(iso(r.end)).toBe("2026-03-09T04:00:00.000Z");
    expect(hours(r)).toBe(23);
  });

  it("maps a wall time that doesn't exist past the gap", () => {
    expect(iso(zonedTimeToInstant("2026-03-08", "01:59", NY))).toBe("2026-03-08T06:59:00.000Z");
    expect(iso(zonedTimeToInstant("2026-03-08", "02:30", NY))).toBe("2026-03-08T07:30:00.000Z");
    expect(iso(zonedTimeToInstant("2026-03-08", "03:00", NY))).toBe("2026-03-08T07:00:00.000Z");
    expect(localParts(at("2026-03-08T07:30:00Z"), NY)).toMatchObject({ hour: 3, minute: 30 });
  });

  it("fall-back day (2026-11-01) is 25 hours", () => {
    const r = localDayRange("2026-11-01", NY);
    expect(iso(r.start)).toBe("2026-11-01T04:00:00.000Z");
    expect(iso(r.end)).toBe("2026-11-02T05:00:00.000Z");
    expect(hours(r)).toBe(25);
  });

  it("maps a wall time that occurs twice to the earlier instant", () => {
    expect(iso(zonedTimeToInstant("2026-11-01", "01:30", NY))).toBe("2026-11-01T05:30:00.000Z");
    expect(localParts(at("2026-11-01T06:30:00Z"), NY)).toMatchObject({ day: 1, hour: 1, minute: 30 });
    expect(iso(zonedTimeToInstant("2026-11-01", "02:00", NY))).toBe("2026-11-01T07:00:00.000Z");
  });

  it("keeps the local date through the night", () => {
    expect(localDateKey(at("2026-11-02T04:59:59Z"), NY)).toBe("2026-11-01");
    expect(localDateKey(at("2026-11-02T05:00:00Z"), NY)).toBe("2026-11-02");
  });
});

describe("Europe/London", () => {
  it("handles the BST start and end", () => {
    const spring = localDayRange("2026-03-29", LDN);
    expect(iso(spring.start)).toBe("2026-03-29T00:00:00.000Z");
    expect(iso(spring.end)).toBe("2026-03-29T23:00:00.000Z");
    expect(iso(zonedTimeToInstant("2026-03-29", "01:30", LDN))).toBe("2026-03-29T01:30:00.000Z");

    const autumn = localDayRange("2026-10-25", LDN);
    expect(iso(autumn.start)).toBe("2026-10-24T23:00:00.000Z");
    expect(iso(autumn.end)).toBe("2026-10-26T00:00:00.000Z");
    expect(iso(zonedTimeToInstant("2026-10-25", "01:30", LDN))).toBe("2026-10-25T00:30:00.000Z");
  });

  it("uses BST for summer dates and months", () => {
    expect(localDateKey(at("2026-06-30T23:30:00Z"), LDN)).toBe("2026-07-01");
    const jul = localMonthRange(at("2026-07-10T12:00:00Z"), LDN);
    expect(iso(jul.start)).toBe("2026-06-30T23:00:00.000Z");
    expect(iso(jul.end)).toBe("2026-07-31T23:00:00.000Z");
  });
});

describe("weeks (Monday to Sunday)", () => {
  it("crosses a month end", () => {
    expect(weekStartKey("2026-11-01")).toBe("2026-10-26");
    expect(weekStartKey("2026-10-26")).toBe("2026-10-26");
    expect(weekDateKeys("2026-10-26")).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
  });

  it("crosses a year end", () => {
    expect(weekStartKey("2027-01-03")).toBe("2026-12-28");
    expect(weekStartKey("2027-01-01")).toBe("2026-12-28");
    expect(weekDateKeys("2026-12-28")).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
  });

  it("adds days across month, leap and year ends", () => {
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-10-26", 0)).toBe("2026-10-26");
  });
});

describe("quiet hours in local time", () => {
  it("wraps midnight (22:00-07:00 IST)", () => {
    const lateNight = at("2026-10-26T17:30:00Z"); // 23:00 IST
    expect(isInLocalQuietHours(lateNight, "22:00", "07:00", IST)).toBe(true);
    expect(iso(nextLocalSendAt(lateNight, "22:00", "07:00", IST))).toBe("2026-10-27T01:30:00.000Z");

    const early = at("2026-10-26T01:29:00Z"); // 06:59 IST
    expect(isInLocalQuietHours(early, "22:00", "07:00", IST)).toBe(true);
    expect(iso(nextLocalSendAt(early, "22:00", "07:00", IST))).toBe("2026-10-26T01:30:00.000Z");

    const open = at("2026-10-26T01:30:00Z"); // 07:00 IST, end is exclusive
    expect(isInLocalQuietHours(open, "22:00", "07:00", IST)).toBe(false);
    expect(nextLocalSendAt(open, "22:00", "07:00", IST).getTime()).toBe(open.getTime());
    expect(isInLocalQuietHours(at("2026-10-26T16:29:00Z"), "22:00", "07:00", IST)).toBe(false);
  });

  it("handles a same-day window and an empty one", () => {
    const t = at("2026-10-26T08:30:00Z"); // 14:00 IST
    expect(isInLocalQuietHours(t, "13:00", "15:00", IST)).toBe(true);
    expect(iso(nextLocalSendAt(t, "13:00", "15:00", IST))).toBe("2026-10-26T09:30:00.000Z");
    expect(isInLocalQuietHours(t, "14:00", "14:00", IST)).toBe(false);
  });

  it("ends at local 07:00 on a DST night", () => {
    const t = at("2026-03-08T04:00:00Z"); // 23:00 EST on 2026-03-07
    expect(isInLocalQuietHours(t, "22:00", "07:00", NY)).toBe(true);
    expect(iso(nextLocalSendAt(t, "22:00", "07:00", NY))).toBe("2026-03-08T11:00:00.000Z");
  });

  it("never returns a send time in the past when the end time repeats", () => {
    const secondHalf = at("2026-11-01T06:15:00Z"); // 01:15 EST, the second 01:15
    expect(isInLocalQuietHours(secondHalf, "01:00", "01:30", NY)).toBe(true);
    expect(iso(nextLocalSendAt(secondHalf, "01:00", "01:30", NY))).toBe("2026-11-01T06:30:00.000Z");
  });
});
