import { describe, expect, it } from "vitest";
import { CalendarTagSchema, ClosetDayContextSchema } from "./closet-context.js";
import { ClosetItemFieldsSchema, LocalDateSchema } from "./closet-item.js";
import { DayPatchSchema, RestyleRequestSchema, WeekGenerateBodySchema } from "./closet-week.js";

describe("LocalDateSchema", () => {
  it("accepts real dates, leap days included", () => {
    expect(LocalDateSchema.safeParse("2026-11-09").success).toBe(true);
    expect(LocalDateSchema.safeParse("2028-02-29").success).toBe(true);
  });

  it("rejects dates Date.parse would roll over, and ones it can't read", () => {
    expect(LocalDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(LocalDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(LocalDateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(LocalDateSchema.safeParse("2026-1-01").success).toBe(false);
  });
});

describe("closet schemas", () => {
  it("defaults every Closet column, so rows from before the migration parse", () => {
    expect(ClosetItemFieldsSchema.parse({})).toMatchObject({
      slot: null,
      setId: null,
      materials: [],
      attributes: null,
      attributesConfirmed: {},
      cutoutStatus: "NONE",
      priceSource: "NONE",
      currency: "INR",
      deletedAt: null,
    });
  });

  it("keeps calendar tags to the reduced shape", () => {
    const tag = { startLocal: "13:00", endLocal: null, kind: "LUNCH", formality: null, outdoor: false, allDay: false };
    expect(CalendarTagSchema.safeParse(tag).success).toBe(true);
    expect(CalendarTagSchema.safeParse({ ...tag, title: "Lunch with Priya" }).success).toBe(false);
    expect(CalendarTagSchema.safeParse({ ...tag, startLocal: "24:00" }).success).toBe(false);
    expect(ClosetDayContextSchema.safeParse({ date: "2026-11-09", weather: null, events: [tag] }).success).toBe(true);
  });

  it("takes one patch at a time and the eight restyle reasons", () => {
    expect(DayPatchSchema.safeParse({ lock: true }).success).toBe(true);
    expect(DayPatchSchema.safeParse({ lock: true, replaceWith: "x" }).success).toBe(false);
    expect(RestyleRequestSchema.shape.reason.options).toHaveLength(8);
    expect(WeekGenerateBodySchema.safeParse({ weekStart: "2026-11-09", mode: "REST_OF_WEEK" }).success).toBe(true);
  });
});
