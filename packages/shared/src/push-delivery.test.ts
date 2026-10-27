import { describe, expect, it, vi } from "vitest";
import {
  closetDeepLinkForEvent,
  deliverQueuedPush,
  evaluateNotificationGate,
  evaluateNotificationGateFromFlags,
  formatQuietHoursNextSendPreview,
  frequencyCapForCategory,
  isFrequencyCapped,
  isInQuietHours,
  msUntilQuietHoursEnd,
  nextEligibleSendAt,
  notificationCategoryForEvent,
  androidChannelForCategory,
  androidChannelIdForEvent,
  sendExpoPush,
} from "./push-delivery.js";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./schemas/notifications.js";

describe("quiet hours", () => {
  const start = "22:00";
  const end = "07:00";

  it("treats quietHoursStart as inclusive boundary", () => {
    expect(isInQuietHours(new Date("2026-08-26T22:00:00.000Z"), start, end)).toBe(true);
    expect(isInQuietHours(new Date("2026-08-26T21:59:00.000Z"), start, end)).toBe(false);
  });

  it("treats quietHoursEnd as exclusive boundary", () => {
    expect(isInQuietHours(new Date("2026-08-26T06:59:00.000Z"), start, end)).toBe(true);
    expect(isInQuietHours(new Date("2026-08-26T07:00:00.000Z"), start, end)).toBe(false);
  });

  it("handles same-day quiet windows", () => {
    expect(isInQuietHours(new Date("2026-08-26T13:30:00.000Z"), "13:00", "14:00")).toBe(true);
    expect(isInQuietHours(new Date("2026-08-26T14:00:00.000Z"), "13:00", "14:00")).toBe(false);
  });

  it("returns false when start equals end (disabled window)", () => {
    expect(isInQuietHours(new Date("2026-08-26T12:00:00.000Z"), "12:00", "12:00")).toBe(false);
  });

  it("computes delay until end of overnight quiet window", () => {
    const now = new Date("2026-08-26T23:00:00.000Z");
    const delay = msUntilQuietHoursEnd(now, start, end);
    // 23:00 → 07:00 = 8h
    expect(delay).toBe(8 * 60 * 60 * 1000);
  });

  it("returns 0 delay outside quiet hours", () => {
    expect(msUntilQuietHoursEnd(new Date("2026-08-26T12:00:00.000Z"), start, end)).toBe(0);
  });

  it("W025 previews next eligible send in user TZ", () => {
    const inside = new Date("2026-08-26T23:30:00.000Z");
    const next = nextEligibleSendAt(inside, start, end);
    expect(next.toISOString()).toBe("2026-08-27T07:00:00.000Z");
    const preview = formatQuietHoursNextSendPreview(inside, start, end, {
      timeZone: "UTC",
      locale: "en-IN",
    });
    expect(preview).toMatch(/Next send at/);
    const outside = formatQuietHoursNextSendPreview(
      new Date("2026-08-26T12:00:00.000Z"),
      start,
      end,
      { timeZone: "UTC" },
    );
    expect(outside).toMatch(/quiet hours open/i);
    // Invalid TZ / locale falls back to ISO HH:MM slice
    const fallback = formatQuietHoursNextSendPreview(inside, start, end, {
      timeZone: "Not/A_Zone",
      locale: "@@",
    });
    expect(fallback).toMatch(/Next send at \d{2}:\d{2}/);
  });

  it("evaluates quiet hours on the given zone's wall clock (C1)", () => {
    // 17:00 UTC = 22:30 IST: quiet in Kolkata, not in UTC.
    const now = new Date("2026-08-26T17:00:00.000Z");
    expect(isInQuietHours(now, start, end, "Asia/Kolkata")).toBe(true);
    expect(isInQuietHours(now, start, end, "UTC")).toBe(false);
    // Window ends 07:00 IST = 01:30 UTC.
    expect(msUntilQuietHoursEnd(now, start, end, "Asia/Kolkata")).toBe(8.5 * 3_600_000);
    expect(nextEligibleSendAt(now, start, end, "Asia/Kolkata").toISOString()).toBe(
      "2026-08-27T01:30:00.000Z",
    );
    expect(
      formatQuietHoursNextSendPreview(now, start, end, { timeZone: "Asia/Kolkata", locale: "en-IN" }),
    ).toBe("Next send at 07:00");
    expect(formatQuietHoursNextSendPreview(now, start, end, { timeZone: "UTC" })).toMatch(
      /quiet hours open/,
    );
  });

  it("handles a DST zone: quiet hours end at local 07:00 on the spring-forward night", () => {
    // New York jumps 02:00 → 03:00 on 2026-03-08. 23:00 EST on the 7th = 04:00 UTC on the 8th.
    const now = new Date("2026-03-08T04:00:00.000Z");
    const next = nextEligibleSendAt(now, start, end, "America/New_York");
    // 07:00 EDT = 11:00 UTC.
    expect(next.toISOString()).toBe("2026-03-08T11:00:00.000Z");
  });
});

describe("category opt-out + gate", () => {
  it("maps Closet event types to notification categories", () => {
    expect(notificationCategoryForEvent("RETURN_DEADLINE")).toBe("returns");
    expect(notificationCategoryForEvent("WARRANTY_EXPIRY")).toBe("warranty");
    expect(notificationCategoryForEvent("CREDIT_EXPIRY")).toBe("credits");
    expect(notificationCategoryForEvent("OUTFIT_READY")).toBe("outfits");
    expect(notificationCategoryForEvent("WEAR_CHALLENGE")).toBe("outfits");
    expect(notificationCategoryForEvent("DECLUTTER_CHALLENGE")).toBe("outfits");
    expect(notificationCategoryForEvent("CPW_GOAL")).toBe("outfits");
    expect(notificationCategoryForEvent("REWEAR_STREAK")).toBe("outfits");
    expect(notificationCategoryForEvent("DRY_CLEAN_PICKUP")).toBe("outfits");
    expect(notificationCategoryForEvent("FOUND_MONEY_WAITING")).toBe("credits");
    expect(notificationCategoryForEvent("WEEKLY_DIGEST")).toBe("digest");
    expect(notificationCategoryForEvent("MONTHLY_DIGEST")).toBe("digest");
    expect(notificationCategoryForEvent("SPEND_ENVELOPE")).toBe("digest");
    expect(notificationCategoryForEvent("CREDIT_BALANCE_RECHECK")).toBe("credits");
    expect(notificationCategoryForEvent("gift_occasion")).toBeNull();
  });

  it("skips when frequency cap is reached for digest", () => {
    expect(isFrequencyCapped(1, 1)).toBe(true);
    expect(
      frequencyCapForCategory(DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps, null),
    ).toBeNull();
    expect(
      frequencyCapForCategory(DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps, "digest"),
    ).toBe(1);
    expect(
      evaluateNotificationGate(
        DEFAULT_NOTIFICATION_PREFERENCES,
        "digest",
        new Date("2026-08-26T12:00:00.000Z"),
        { recentCategoryCount: 1, timeZone: "UTC" },
      ),
    ).toEqual({ action: "skip", reason: "frequency_cap" });
  });

  it("skips when the category is opted out", () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      categories: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
        returns: false,
      },
    };
    expect(
      evaluateNotificationGate(prefs, "returns", new Date("2026-08-26T12:00:00.000Z"), {
        timeZone: "UTC",
      }),
    ).toEqual({ action: "skip", reason: "category_opt_out" });
  });

  it("delays when inside quiet hours", () => {
    const gate = evaluateNotificationGate(
      DEFAULT_NOTIFICATION_PREFERENCES,
      "credits",
      new Date("2026-08-26T23:30:00.000Z"),
      { timeZone: "UTC" },
    );
    expect(gate.action).toBe("delay");
    if (gate.action === "delay") {
      expect(gate.delayMs).toBeGreaterThan(0);
    }
  });

  it("allows send outside quiet hours when category enabled", () => {
    expect(
      evaluateNotificationGate(
        DEFAULT_NOTIFICATION_PREFERENCES,
        "outfits",
        new Date("2026-08-26T12:00:00.000Z"),
        { timeZone: "UTC" },
      ),
    ).toEqual({ action: "send" });
    // Same instant is 17:30 IST: still outside quiet hours there.
    expect(
      evaluateNotificationGate(
        DEFAULT_NOTIFICATION_PREFERENCES,
        "outfits",
        new Date("2026-08-26T12:00:00.000Z"),
        { timeZone: "Asia/Kolkata" },
      ),
    ).toEqual({ action: "send" });
  });

  it("maps the new reminder event types to a category and a real screen", () => {
    expect(notificationCategoryForEvent("CAL_EVENT_OUTFIT")).toBe("outfits");
    expect(notificationCategoryForEvent("INTERVIEW_KIT_REMINDER")).toBe("outfits");
    expect(notificationCategoryForEvent("LENT_OVERDUE")).toBe("outfits");
    expect(closetDeepLinkForEvent("CAL_EVENT_OUTFIT").deepLink).toBe("worn://today");
    expect(closetDeepLinkForEvent("INTERVIEW_KIT_REMINDER").deepLink).toBe("worn://today");
    expect(closetDeepLinkForEvent("LENT_OVERDUE", { wardrobeItemId: "w1" }).deepLink).toBe(
      "worn://wardrobe?item=w1",
    );
  });

  it("evaluateNotificationGateFromFlags reads user.prefs.notifications", () => {
    const gate = evaluateNotificationGateFromFlags(
      {
        notifications: {
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
          categories: {
            returns: false,
            warranty: true,
            credits: true,
            outfits: true,
            digest: true,
          },
          frequencyCaps: DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps,
        },
      },
      "RETURN_DEADLINE",
      new Date("2026-08-26T12:00:00.000Z"),
      { timeZone: "UTC" },
    );
    expect(gate).toEqual({ action: "skip", reason: "category_opt_out" });
  });
});

describe("closet deep links", () => {
  it("builds worn:// deep links for Closet surfaces", () => {
    expect(closetDeepLinkForEvent("RETURN_DEADLINE", { returnId: "r1" })).toMatchObject({
      deepLink: "worn://returns",
      screen: "returns",
      returnId: "r1",
    });
    expect(closetDeepLinkForEvent("CREDIT_EXPIRY", { accountId: "a1" })).toMatchObject({
      deepLink: "worn://vault?focus=expiry",
      screen: "vault",
    });
    expect(closetDeepLinkForEvent("WARRANTY_EXPIRY")).toMatchObject({
      deepLink: "worn://vault?focus=warranty",
      screen: "vault",
    });
    expect(closetDeepLinkForEvent("OUTFIT_READY", { outfitId: "o1" })).toMatchObject({
      deepLink: "worn://today?focus=outfit",
      screen: "today",
    });
    expect(closetDeepLinkForEvent("WEAR_CHALLENGE", { wardrobeItemId: "w1" })).toMatchObject({
      deepLink: "worn://wardrobe?item=w1",
      screen: "wardrobe",
    });
    expect(closetDeepLinkForEvent("WEAR_CHALLENGE")).toMatchObject({
      deepLink: "worn://wardrobe",
      screen: "wardrobe",
    });
    expect(closetDeepLinkForEvent("gift_occasion", { recipientId: "r9" })).toMatchObject({
      deepLink: "worn://recipients?focus=r9",
      screen: "recipients",
    });
    expect(closetDeepLinkForEvent("gift_occasion")).toMatchObject({
      deepLink: "worn://recipients",
      screen: "recipients",
    });
    expect(closetDeepLinkForEvent("tailoring_update", { orderId: "t1" })).toMatchObject({
      deepLink: "worn://fit?order=t1",
      screen: "fit",
    });
    expect(closetDeepLinkForEvent("unknown_event")).toMatchObject({
      deepLink: "worn://consent",
      screen: "consent",
    });
    expect(closetDeepLinkForEvent("REWEAR_STREAK")).toMatchObject({
      deepLink: "worn://today",
      screen: "today",
    });
    expect(closetDeepLinkForEvent("CPW_GOAL", { wardrobeItemId: "w1" })).toMatchObject({
      deepLink: "worn://wardrobe?item=w1",
      screen: "wardrobe",
    });
    expect(closetDeepLinkForEvent("CPW_GOAL")).toMatchObject({
      deepLink: "worn://accountant",
      screen: "accountant",
    });
    expect(closetDeepLinkForEvent("DECLUTTER_CHALLENGE")).toMatchObject({
      deepLink: "worn://disposition",
      screen: "disposition",
    });
    expect(
      closetDeepLinkForEvent("SPEND_ENVELOPE", { category: "APPAREL", periodLabel: "2026-08" }),
    ).toMatchObject({
      deepLink: "worn://accountant?category=APPAREL&period=2026-08",
      screen: "accountant",
      category: "APPAREL",
    });
    expect(closetDeepLinkForEvent("MONTHLY_DIGEST", { monthLabel: "2026-08" })).toMatchObject({
      deepLink: "worn://accountant?month=2026-08",
      screen: "accountant",
      monthLabel: "2026-08",
    });
    expect(closetDeepLinkForEvent("MONTHLY_DIGEST")).toMatchObject({
      deepLink: "worn://accountant",
      screen: "accountant",
    });
    expect(closetDeepLinkForEvent("WEEKLY_DIGEST")).toMatchObject({
      deepLink: "worn://vault?focus=found-money",
      screen: "vault",
    });
    expect(closetDeepLinkForEvent("EMI_DUE", { planId: "p1" })).toMatchObject({
      deepLink: "worn://accountant?focus=emi&plan=p1",
      screen: "accountant",
    });
    expect(closetDeepLinkForEvent("EMI_DUE")).toMatchObject({
      deepLink: "worn://accountant?focus=emi",
      screen: "accountant",
    });
    expect(closetDeepLinkForEvent("CASHBACK_CLAIM_DEADLINE", { claimId: "c1" })).toMatchObject({
      deepLink: "worn://vault?tab=claims&claim=c1",
      screen: "vault",
    });
    expect(closetDeepLinkForEvent("PRICE_DROP", { listingId: "l1" })).toMatchObject({
      deepLink: "worn://vault?focus=price-drop&listing=l1",
      screen: "vault",
    });
    expect(closetDeepLinkForEvent("PRICE_DROP")).toMatchObject({
      deepLink: "worn://vault?focus=price-drop",
      screen: "vault",
    });
    expect(closetDeepLinkForEvent("CREDIT_BALANCE_RECHECK")).toMatchObject({
      deepLink: "worn://vault?focus=found-money",
      screen: "vault",
    });
    expect(closetDeepLinkForEvent("DRY_CLEAN_PICKUP")).toMatchObject({
      deepLink: "worn://wardrobe",
      screen: "wardrobe",
    });
    expect(closetDeepLinkForEvent("SPEND_ENVELOPE")).toMatchObject({
      deepLink: "worn://accountant",
      screen: "accountant",
    });
    expect(closetDeepLinkForEvent("cooling_off_released")).toMatchObject({
      deepLink: "worn://checkout",
      screen: "checkout",
    });
  });
});

describe("enqueue → send mock", () => {
  it("leaves QUEUED when there is no push token", async () => {
    const result = await deliverQueuedPush({
      pushToken: null,
      title: "t",
      body: "b",
      data: { deepLink: "worn://returns" },
    });
    expect(result).toEqual({ status: "QUEUED" });
  });

  it("marks SENT when Expo send mock succeeds", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-1" }));
    const result = await deliverQueuedPush({
      pushToken: "ExponentPushToken[test]",
      title: "Return window closes tomorrow",
      body: "Initiate now.",
      data: { deepLink: "worn://returns", screen: "returns" },
      sendExpo,
    });
    expect(result).toEqual({ status: "SENT", expoTicketId: "ticket-1" });
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ExponentPushToken[test]",
        data: expect.objectContaining({ deepLink: "worn://returns" }),
      }),
    );
  });

  it("sendExpoPush posts to Expo and reads ticket id", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ status: "ok", id: "XXXX" }] }),
    })) as unknown as typeof fetch;

    const result = await sendExpoPush(
      {
        to: "ExponentPushToken[abc]",
        title: "Hi",
        body: "Body",
        data: { deepLink: "worn://order/1" },
      },
      { fetchImpl },
    );
    expect(result).toEqual({ ok: true, ticketId: "XXXX" });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("sendExpoPush stubs a ticket when fetch is unavailable", async () => {
    const result = await sendExpoPush(
      { to: "ExponentPushToken[nofetch]", title: "t", body: "b" },
      // Non-nullish non-function so `?? globalThis.fetch` does not restore fetch.
      { fetchImpl: false as unknown as typeof fetch },
    );
    expect(result).toEqual({
      ok: true,
      ticketId: expect.stringMatching(/^stub:ExponentPushToken\[nofetch]:\d+$/),
    });
  });

  it("sendExpoPush fails on missing token / http error / ticket message / throw", async () => {
    expect(
      await sendExpoPush({ to: "", title: "t", body: "b" }, { fetchImpl: vi.fn() as never }),
    ).toEqual({ ok: false, error: "missing_push_token" });

    const badHttp = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    expect(
      await sendExpoPush(
        { to: "ExponentPushToken[x]", title: "t", body: "b" },
        { fetchImpl: badHttp },
      ),
    ).toEqual({ ok: false, error: "http_502" });

    const ticketFail = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ status: "error", message: "DeviceNotRegistered" }] }),
    })) as unknown as typeof fetch;
    expect(
      await sendExpoPush(
        { to: "ExponentPushToken[x]", title: "t", body: "b" },
        { fetchImpl: ticketFail },
      ),
    ).toEqual({ ok: false, error: "DeviceNotRegistered" });

    const throws = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(
      await sendExpoPush(
        { to: "ExponentPushToken[x]", title: "t", body: "b" },
        { fetchImpl: throws },
      ),
    ).toEqual({ ok: false, error: "Error: network down" });
  });

  it("sendExpoPush accepts ticket id without status ok", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "ticket-no-status" }] }),
    })) as unknown as typeof fetch;
    expect(
      await sendExpoPush(
        { to: "ExponentPushToken[x]", title: "t", body: "b" },
        { fetchImpl },
      ),
    ).toEqual({ ok: true, ticketId: "ticket-no-status" });
  });

  it("deliverQueuedPush marks FAILED when Expo send fails", async () => {
    const sendExpo = vi.fn(async () => ({ ok: false as const, error: "boom" }));
    expect(
      await deliverQueuedPush({
        pushToken: "ExponentPushToken[test]",
        title: "t",
        body: "b",
        data: {},
        sendExpo,
      }),
    ).toEqual({ status: "FAILED" });
  });
});

describe("android notification channels", () => {
  it("maps categories and Closet event types to channel ids", () => {
    expect(androidChannelForCategory("returns").id).toBe("worn-returns");
    expect(androidChannelForCategory("digest").name).toMatch(/digest/i);
    expect(androidChannelIdForEvent("RETURN_DEADLINE")).toBe("worn-returns");
    expect(androidChannelIdForEvent("WEEKLY_DIGEST")).toBe("worn-digest");
    expect(androidChannelIdForEvent("not_a_closet_event")).toBeUndefined();
  });
});
