import { describe, expect, it, vi } from "vitest";
import {
  GIFT_BIRTHDAY_LEAD_DAYS,
  GIFT_FESTIVAL_LEAD_DAYS,
  GIFT_OCCASION_EVENT,
  computeGiftOccasionReminderDelayMs,
  deliverGiftOccasionPush,
  giftOccasionJobId,
  giftOccasionLeadDays,
  giftOccasionPushCopy,
  giftOccasionDedupeKey,
  isFestivalOccasion,
} from "./gift-occasion-push.js";

describe("gift occasion lead schedule", () => {
  it("uses 12-day lead for festivals and 3-day for birthdays", () => {
    expect(giftOccasionLeadDays("FESTIVAL", "Diwali")).toBe(GIFT_FESTIVAL_LEAD_DAYS);
    expect(giftOccasionLeadDays("birthday")).toBe(GIFT_BIRTHDAY_LEAD_DAYS);
    expect(isFestivalOccasion("OTHER", "Rakhi")).toBe(true);
    expect(GIFT_FESTIVAL_LEAD_DAYS).toBe(12);
    expect(GIFT_BIRTHDAY_LEAD_DAYS).toBe(3);
  });

  it("schedules festival reminder 12 days before occasion", () => {
    const now = new Date("2026-10-27T12:00:00.000Z");
    const diwali = "2026-11-08T00:00:00.000Z";
    const delay = computeGiftOccasionReminderDelayMs(diwali, "FESTIVAL", {
      label: "Diwali",
      now,
    });
    // 12 days before Nov 8 = Oct 27 00:00 → already inside lead window from noon Oct 27
    expect(delay).toBe(100);
  });

  it("schedules birthday reminder 3 days before", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const bday = "2026-09-05T00:00:00.000Z"; // 10 days out
    const delay = computeGiftOccasionReminderDelayMs(bday, "BIRTHDAY", { now });
    expect(delay).toBe(10 * 86_400_000 - 3 * 86_400_000 - 12 * 3_600_000);
  });

  it("returns null when occasion is past", () => {
    expect(
      computeGiftOccasionReminderDelayMs("2020-01-01T00:00:00.000Z", "BIRTHDAY", {
        now: new Date("2026-08-26T12:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("accepts numeric now and invalid occasion dates", () => {
    const nowMs = Date.parse("2026-08-26T12:00:00.000Z");
    const delay = computeGiftOccasionReminderDelayMs("2026-09-10T00:00:00.000Z", "BIRTHDAY", {
      now: nowMs,
      leadDays: 3,
    });
    expect(delay).toBeGreaterThan(0);
    expect(computeGiftOccasionReminderDelayMs("not-a-date", "BIRTHDAY", { now: nowMs })).toBeNull();
  });

  it("builds stable job + dedupe ids", () => {
    expect(giftOccasionJobId("r1", "FESTIVAL", "2026-11-08")).toBe(
      "gift:r1:FESTIVAL:2026-11-08",
    );
    expect(giftOccasionDedupeKey("r1", "FESTIVAL", "2026-11-08")).toBe(
      "gift-occasion:r1:FESTIVAL:2026-11-08",
    );
  });
});

describe("giftOccasionPushCopy", () => {
  it("builds 12 days to Diwali delight copy", () => {
    const copy = giftOccasionPushCopy({
      occasion: "FESTIVAL",
      label: "Diwali",
      date: "2026-11-08T00:00:00.000Z",
      recipientName: "Mom",
      ideaCount: 3,
      now: new Date("2026-10-27T12:00:00.000Z"),
    });
    expect(copy.title).toBe("12 days to Diwali");
    expect(copy.body).toBe("3 perfect gifts for Mom, all in budget.");
  });

  it("handles today / 1-day / mapped occasion labels", () => {
    const today = giftOccasionPushCopy({
      occasion: "BIRTHDAY",
      date: "2026-08-26T18:00:00.000Z",
      now: new Date("2026-08-26T12:00:00.000Z"),
    });
    expect(today.title).toBe("Birthday is today");
    expect(today.body).toContain("them");

    const oneDay = giftOccasionPushCopy({
      occasion: "ANNIVERSARY",
      date: "2026-08-27T00:00:00.000Z",
      recipientName: "  ",
      ideaCount: 0,
      now: new Date("2026-08-26T12:00:00.000Z"),
    });
    expect(oneDay.title).toBe("1 day to Anniversary");
    expect(oneDay.body).toBe("Time to pick a gift for them.");

    const other = giftOccasionPushCopy({
      occasion: "CUSTOM",
      date: "2026-09-01T00:00:00.000Z",
      now: new Date("2026-08-26T12:00:00.000Z"),
    });
    expect(other.title).toContain("CUSTOM");
  });
});

describe("deliverGiftOccasionPush", () => {
  const NOON = new Date("2026-08-26T12:00:00.000Z");

  it("marks SENT with deep link outside quiet hours", async () => {
    const insertQueued = vi.fn(async () => ({ id: "evt-g1" }));
    const markStatus = vi.fn(async () => {});
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t-g1" }));

    const result = await deliverGiftOccasionPush({
      userId: "u1",
      recipientId: "r1",
      occasion: "FESTIVAL",
      date: "2026-11-08T00:00:00.000Z",
      label: "Diwali",
      recipientName: "Mom",
      ideaCount: 3,
      prefs: {},
      timeZone: "UTC",
      pushToken: "ExponentPushToken[gift]",
      now: NOON,
      sendExpo,
      insertQueued,
      markStatus,
    });

    expect(result).toEqual({ status: "sent" });
    expect(insertQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Diwali"),
        payload: expect.objectContaining({
          deepLink: "worn://recipients?focus=r1",
          screen: "recipients",
          occasion: "FESTIVAL",
        }),
      }),
    );
    expect(markStatus).toHaveBeenCalledWith("evt-g1", "SENT", "t-g1");
  });

  it("delays inside quiet hours without inserting", async () => {
    const insertQueued = vi.fn();
    const result = await deliverGiftOccasionPush({
      userId: "u1",
      recipientId: "r1",
      occasion: "birthday",
      date: "2026-09-01",
      prefs: {},
      timeZone: "UTC",
      pushToken: "ExponentPushToken[x]",
      now: new Date("2026-08-26T23:15:00.000Z"),
      insertQueued,
      markStatus: vi.fn(),
    });
    expect(result.status).toBe("delayed");
    expect(insertQueued).not.toHaveBeenCalled();
  });

  it("uses gift_occasion event type", () => {
    expect(GIFT_OCCASION_EVENT).toBe("gift_occasion");
  });
});
