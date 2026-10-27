import { describe, expect, it, vi } from "vitest";
import { runClosetPushDelivery } from "./closet-push-flow.js";

describe("runClosetPushDelivery", () => {
  it("skips when category is opted out", async () => {
    const insertQueued = vi.fn();
    const result = await runClosetPushDelivery({
      eventType: "RETURN_DEADLINE",
      consentFlags: {
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
      consentFlags: null,
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

  it("queues, delivers, and marks SENT", async () => {
    const insertQueued = vi.fn(async () => ({ id: "evt-1" }));
    const markStatus = vi.fn(async () => {});
    const sendExpo = vi.fn(async () => ({
      ok: true as const,
      ticketId: "ticket-1",
    }));

    const result = await runClosetPushDelivery({
      eventType: "OUTFIT_READY",
      consentFlags: {
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

  it("marks FAILED when Expo delivery fails", async () => {
    const markStatus = vi.fn(async () => {});
    const result = await runClosetPushDelivery({
      eventType: "WARRANTY_EXPIRY",
      consentFlags: null,
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
      consentFlags: null,
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
