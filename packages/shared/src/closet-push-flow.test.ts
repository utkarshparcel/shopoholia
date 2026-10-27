import { describe, expect, it, vi } from "vitest";
import { runClosetPushDelivery } from "./closet-push-flow.js";

describe("runClosetPushDelivery", () => {
  it("skips when category is opted out", async () => {
    const insertQueued = vi.fn();
    const result = await runClosetPushDelivery({
      eventType: "RETURN_DEADLINE",
      prefs: {
        notifications: {
          categories: {
            returns: false,
            warranty: true,
            credits: true,
            outfits: true,
            digest: true,
          },
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        },
      },
      timeZone: "UTC",
      pushToken: "ExponentPushToken[x]",
      title: "Return soon",
      body: "Window closing",
      now: new Date("2026-08-26T12:00:00.000Z"),
      insertQueued,
      markStatus: vi.fn(),
    });
    expect(result).toEqual({ status: "skipped" });
    expect(insertQueued).not.toHaveBeenCalled();
  });

  it("delays inside quiet hours", async () => {
    const result = await runClosetPushDelivery({
      eventType: "CREDIT_EXPIRY",
      prefs: null,
      timeZone: "UTC",
      pushToken: "ExponentPushToken[x]",
      title: "Credit",
      body: "Expiring",
      now: new Date("2026-08-26T23:30:00.000Z"),
      insertQueued: vi.fn(),
      markStatus: vi.fn(),
    });
    expect(result.status).toBe("delayed");
    if (result.status === "delayed") {
      expect(result.delayMs).toBeGreaterThan(0);
    }
  });

  it("reads quiet hours on the user's wall clock, not UTC (C1)", async () => {
    // 17:00 UTC is 22:30 in Kolkata: inside the default 22:00–07:00 window there, not in UTC.
    const now = new Date("2026-08-26T17:00:00.000Z");
    const insertQueued = vi.fn(async () => ({ id: "evt-tz" }));
    const kolkata = await runClosetPushDelivery({
      eventType: "CREDIT_EXPIRY",
      prefs: {},
      timeZone: "Asia/Kolkata",
      pushToken: null,
      title: "Credit",
      body: "Expiring",
      now,
      insertQueued,
      markStatus: vi.fn(),
    });
    // Quiet hours end at 07:00 IST = 01:30 UTC next day: 8.5 hours later.
    expect(kolkata).toEqual({ status: "delayed", delayMs: 8.5 * 3_600_000 });
    expect(insertQueued).not.toHaveBeenCalled();

    const utc = await runClosetPushDelivery({
      eventType: "CREDIT_EXPIRY",
      prefs: {},
      timeZone: "UTC",
      pushToken: null,
      title: "Credit",
      body: "Expiring",
      now,
      insertQueued,
      markStatus: vi.fn(),
    });
    expect(utc).toEqual({ status: "queued" });
  });

  it("falls back to the default zone for a missing or invalid time zone", async () => {
    const result = await runClosetPushDelivery({
      eventType: "CREDIT_EXPIRY",
      prefs: {},
      timeZone: "Not/A_Zone",
      pushToken: null,
      title: "Credit",
      body: "Expiring",
      now: new Date("2026-08-26T17:00:00.000Z"),
      insertQueued: vi.fn(),
      markStatus: vi.fn(),
    });
    expect(result.status).toBe("delayed");
  });

  it("queues, delivers, and marks SENT", async () => {
    const insertQueued = vi.fn(async () => ({ id: "evt-1" }));
    const markStatus = vi.fn(async () => {});
    const sendExpo = vi.fn(async () => ({
      ok: true as const,
      ticketId: "ticket-1",
    }));

    const result = await runClosetPushDelivery({
      eventType: "OUTFIT_READY",
      prefs: {
        notifications: {
          categories: {
            returns: true,
            warranty: true,
            credits: true,
            outfits: true,
            digest: true,
          },
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        },
      },
      timeZone: "UTC",
      pushToken: "ExponentPushToken[abc]",
      title: "Outfit ready",
      body: "Your look for today",
      deepLinkExtra: { outfitId: "o1" },
      payloadExtra: { source: "nightly" },
      now: new Date("2026-08-26T08:00:00.000Z"),
      sendExpo,
      insertQueued,
      markStatus,
    });

    expect(result).toEqual({ status: "sent" });
    expect(insertQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Outfit ready",
        payload: expect.objectContaining({
          deepLink: "worn://today?focus=outfit",
          source: "nightly",
        }),
      }),
    );
    expect(markStatus).toHaveBeenCalledWith("evt-1", "SENT", "ticket-1");
  });

  it("does not send again when the deduped row is already SENT (rerun)", async () => {
    const sendExpo = vi.fn();
    const markStatus = vi.fn();
    const result = await runClosetPushDelivery({
      eventType: "RETURN_DEADLINE",
      prefs: {},
      timeZone: "UTC",
      pushToken: "ExponentPushToken[abc]",
      title: "Return soon",
      body: "Window closing",
      now: new Date("2026-08-26T12:00:00.000Z"),
      sendExpo,
      insertQueued: vi.fn(async () => ({ id: "evt-1", status: "SENT" as const })),
      markStatus,
    });
    expect(result).toEqual({ status: "skipped" });
    expect(sendExpo).not.toHaveBeenCalled();
    expect(markStatus).not.toHaveBeenCalled();
  });

  it("retries delivery when the deduped row is still QUEUED (crash before send)", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t-2" }));
    const markStatus = vi.fn(async () => {});
    const result = await runClosetPushDelivery({
      eventType: "RETURN_DEADLINE",
      prefs: {},
      timeZone: "UTC",
      pushToken: "ExponentPushToken[abc]",
      title: "Return soon",
      body: "Window closing",
      now: new Date("2026-08-26T12:00:00.000Z"),
      sendExpo,
      insertQueued: vi.fn(async () => ({ id: "evt-1", status: "QUEUED" as const })),
      markStatus,
    });
    expect(result).toEqual({ status: "sent" });
    expect(sendExpo).toHaveBeenCalledTimes(1);
    expect(markStatus).toHaveBeenCalledWith("evt-1", "SENT", "t-2");
  });

  it("logs the event type and ids only, never the title or deep link", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await runClosetPushDelivery({
        eventType: "PRICE_DROP",
        prefs: {},
        timeZone: "UTC",
        pushToken: null,
        title: "Secret Brand jacket is down ₹900",
        body: "body",
        deepLinkExtra: { listingId: "listing-9" },
        now: new Date("2026-08-26T12:00:00.000Z"),
        insertQueued: vi.fn(async () => ({ id: "evt-9" })),
        markStatus: vi.fn(),
      });
      expect(info).toHaveBeenCalledWith("[push]", {
        eventType: "PRICE_DROP",
        pushEventId: "evt-9",
      });
      const logged = JSON.stringify(info.mock.calls);
      expect(logged).not.toContain("Secret Brand");
      expect(logged).not.toContain("worn://");
    } finally {
      info.mockRestore();
    }
  });

  it("marks FAILED when Expo delivery fails", async () => {
    const markStatus = vi.fn(async () => {});
    const result = await runClosetPushDelivery({
      eventType: "WARRANTY_EXPIRY",
      prefs: null,
      timeZone: "UTC",
      pushToken: "ExponentPushToken[abc]",
      title: "Warranty",
      body: "Expiring",
      now: new Date("2026-08-26T12:00:00.000Z"),
      sendExpo: vi.fn(async () => ({ ok: false as const, error: "boom" })),
      insertQueued: vi.fn(async () => ({ id: "evt-2" })),
      markStatus,
    });
    expect(result).toEqual({ status: "failed" });
    expect(markStatus).toHaveBeenCalledWith("evt-2", "FAILED", null);
  });

  it("returns queued when there is no push token", async () => {
    const markStatus = vi.fn();
    const result = await runClosetPushDelivery({
      eventType: "CREDIT_EXPIRY",
      prefs: null,
      timeZone: "UTC",
      pushToken: null,
      title: "Credit",
      body: "Expiring",
      now: new Date("2026-08-26T12:00:00.000Z"),
      insertQueued: vi.fn(async () => ({ id: "evt-3" })),
      markStatus,
    });
    expect(result).toEqual({ status: "queued" });
    expect(markStatus).not.toHaveBeenCalled();
  });
});
