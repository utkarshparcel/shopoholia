import { describe, expect, it, vi } from "vitest";
import {
  ANDROID_NOTIFICATION_CHANNELS,
  buildClosetRichPushPayload,
  deliverQueuedPush,
  evaluateNotificationGate,
  isFrequencyCapped,
  notificationCategoryForEvent,
  sendExpoPush,
} from "./push-delivery.js";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./schemas/notifications.js";
import { runClosetPushDelivery } from "./closet-push-flow.js";
import {
  deliverFoundMoneyWaiting,
  deliverMonthlyDigest,
  deliverWeeklyDigest,
  foundMoneyWaitingCopy,
  foundMoneyWaitingJobId,
  FOUND_MONEY_WAITING_EVENT,
  MONTHLY_DIGEST_EVENT,
  monthlyDigestCopy,
  monthlyDigestJobId,
  utcIsoWeekKey,
  utcMonthKey,
  weeklyDigestCopy,
  weeklyDigestJobId,
  WEEKLY_DIGEST_EVENT,
} from "./reengage-nudge.js";

describe("frequency caps (NOTIF-REENGAGE)", () => {
  it("isFrequencyCapped when recent count reaches cap", () => {
    expect(isFrequencyCapped(0, 1)).toBe(false);
    expect(isFrequencyCapped(1, 1)).toBe(true);
    expect(isFrequencyCapped(3, 3)).toBe(true);
    expect(isFrequencyCapped(2, 3)).toBe(false);
  });

  it("skips gate when category is at frequency cap", () => {
    const gate = evaluateNotificationGate(
      DEFAULT_NOTIFICATION_PREFERENCES,
      "digest",
      new Date("2026-08-26T12:00:00.000Z"),
      { recentCategoryCount: 1 },
    );
    expect(gate).toEqual({ action: "skip", reason: "frequency_cap" });
  });

  it("allows send when under cap and outside quiet hours", () => {
    expect(
      evaluateNotificationGate(
        DEFAULT_NOTIFICATION_PREFERENCES,
        "credits",
        new Date("2026-08-26T12:00:00.000Z"),
        { recentCategoryCount: 0 },
      ),
    ).toEqual({ action: "send" });
  });

  it("maps re-engage events to categories", () => {
    expect(notificationCategoryForEvent(FOUND_MONEY_WAITING_EVENT)).toBe("credits");
    expect(notificationCategoryForEvent(WEEKLY_DIGEST_EVENT)).toBe("digest");
    expect(notificationCategoryForEvent(MONTHLY_DIGEST_EVENT)).toBe("digest");
  });
});

describe("rich push payload (NOTIF-RICH)", () => {
  it("builds Android channel + image + amount shape for return deadline", () => {
    const rich = buildClosetRichPushPayload({
      eventType: "RETURN_DEADLINE",
      rich: {
        imageUrl: "https://cdn.example/item.jpg",
        amountMinor: 249_900,
        currency: "INR",
      },
    });
    expect(rich.channelId).toBe(ANDROID_NOTIFICATION_CHANNELS.returns.id);
    expect(rich.richContent).toEqual({ image: "https://cdn.example/item.jpg" });
    expect(rich.mutableContent).toBe(true);
    expect(rich.dataExtras).toMatchObject({
      androidChannelId: "worn-returns",
      imageUrl: "https://cdn.example/item.jpg",
      amountMinor: 249_900,
      currency: "INR",
    });
  });

  it("includes channel without image when no rich image", () => {
    const rich = buildClosetRichPushPayload({
      eventType: "CREDIT_EXPIRY",
      rich: { amountMinor: 1000 },
    });
    expect(rich.channelId).toBe("worn-credits");
    expect(rich.richContent).toBeUndefined();
    expect(rich.dataExtras.amountMinor).toBe(1000);
  });

  it("exposes one Android channel per category", () => {
    expect(Object.keys(ANDROID_NOTIFICATION_CHANNELS).sort()).toEqual(
      ["credits", "digest", "outfits", "returns", "warranty"].sort(),
    );
  });

  it("sendExpoPush posts channelId + richContent.image", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ status: "ok", id: "ticket-rich" }] }),
    })) as unknown as typeof fetch;

    await sendExpoPush(
      {
        to: "ExponentPushToken[abc]",
        title: "Return soon",
        body: "3 days left",
        data: { deepLink: "worn://returns" },
        channelId: "worn-returns",
        richContent: { image: "https://cdn.example/x.jpg" },
        mutableContent: true,
      },
      { fetchImpl },
    );

    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as { body: string }).body,
    ) as Array<Record<string, unknown>>;
    expect(body[0]).toMatchObject({
      channelId: "worn-returns",
      richContent: { image: "https://cdn.example/x.jpg" },
      mutableContent: true,
    });
  });

  it("runClosetPushDelivery merges rich payload and Expo fields", async () => {
    const sendExpo = vi.fn(async () => ({
      ok: true as const,
      ticketId: "t-rich",
    }));
    const insertQueued = vi.fn(async () => ({ id: "evt-rich" }));
    const markStatus = vi.fn(async () => {});

    const result = await runClosetPushDelivery({
      eventType: "RETURN_DEADLINE",
      consentFlags: null,
      pushToken: "ExponentPushToken[x]",
      title: "Return window closes in 3 days",
      body: "Initiate now.",
      rich: { imageUrl: "https://cdn.example/tee.jpg", amountMinor: 1999 },
      now: new Date("2026-08-26T12:00:00.000Z"),
      sendExpo,
      insertQueued,
      markStatus,
    });

    expect(result).toEqual({ status: "sent" });
    expect(insertQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          deepLink: "worn://returns",
          imageUrl: "https://cdn.example/tee.jpg",
          amountMinor: 1999,
          androidChannelId: "worn-returns",
        }),
      }),
    );
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "worn-returns",
        richContent: { image: "https://cdn.example/tee.jpg" },
      }),
    );
  });

  it("deliverQueuedPush forwards channel + richContent", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t1" }));
    await deliverQueuedPush({
      pushToken: "ExponentPushToken[t]",
      title: "t",
      body: "b",
      data: { deepLink: "worn://returns" },
      channelId: "worn-returns",
      richContent: { image: "https://cdn.example/a.jpg" },
      sendExpo,
    });
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "worn-returns",
        richContent: { image: "https://cdn.example/a.jpg" },
      }),
    );
  });
});

describe("re-engage copy + delivery", () => {
  it("builds found-money waiting copy with amount", () => {
    const copy = foundMoneyWaitingCopy({
      totalMinor: 240_000,
      accountCount: 2,
      currency: "INR",
    });
    expect(copy.title).toContain("waiting");
    expect(copy.title).toMatch(/₹|INR|2/);
    expect(copy.body).toMatch(/2 gift cards/);
  });

  it("builds weekly digest copy with CPW", () => {
    const copy = weeklyDigestCopy({
      spendMinor: 50_000,
      avgCostPerWearMinor: 1_250,
      currency: "INR",
    });
    expect(copy.title).toMatch(/week/i);
    expect(copy.body).toMatch(/cost-per-wear/i);

    const plain = weeklyDigestCopy({ spendMinor: 10_000 });
    expect(plain.title).toMatch(/week/i);
    expect(plain.body).toMatch(/Spent/);
    expect(plain.body).not.toMatch(/cost-per-wear/);
  });

  it("W026 weekly digest still-have uses formatMinor + vault framing", () => {
    const copy = weeklyDigestCopy({
      spendMinor: 50_000,
      stillHaveMinor: 240_000,
      currency: "INR",
    });
    expect(copy.title).toMatch(/still have/i);
    expect(copy.title).toMatch(/₹|2/);
    expect(copy.body).toMatch(/vault/i);

    const withCpw = weeklyDigestCopy({
      spendMinor: 50_000,
      stillHaveMinor: 10_000,
      avgCostPerWearMinor: 500,
      currency: "INR",
    });
    expect(withCpw.body).toMatch(/cost-per-wear/i);
  });

  it("weekly digest prefers still-have headline when vault has balance", () => {
    const copy = weeklyDigestCopy({
      spendMinor: 50_000,
      stillHaveMinor: 12_000,
      currency: "INR",
    });
    expect(copy.title).toMatch(/still have/i);
  });

  it("builds monthly digest copy with spend + CPW", () => {
    const copy = monthlyDigestCopy({
      spendMinor: 120_000,
      avgCostPerWearMinor: 800,
      monthLabel: "2026-08",
      currency: "INR",
    });
    expect(copy.title).toMatch(/2026-08|P&L/i);
    expect(copy.body).toMatch(/cost-per-wear/i);

    const plain = monthlyDigestCopy({ spendMinor: 80_000 });
    expect(plain.title).toMatch(/this month/i);
    expect(plain.body).not.toMatch(/cost-per-wear/);
  });

  it("utcIsoWeekKey is stable for mid-week dates", () => {
    expect(utcIsoWeekKey(new Date("2026-08-26T12:00:00.000Z"))).toMatch(
      /^2026-W\d{2}$/,
    );
  });

  it("utcMonthKey + monthlyDigestJobId are stable", () => {
    expect(utcMonthKey(new Date("2026-08-26T12:00:00.000Z"))).toBe("2026-08");
    expect(monthlyDigestJobId("u1", "2026-08")).toBe("monthly-digest:u1:2026-08");
    expect(foundMoneyWaitingJobId("u1", "2026-W34")).toBe("found-money:u1:2026-W34");
    expect(weeklyDigestJobId("u1", "2026-W34")).toBe("digest:u1:2026-W34");
  });

  it("caps found-money waiting when credits category is at limit", async () => {
    const insertQueued = vi.fn();
    const result = await deliverFoundMoneyWaiting({
      totalMinor: 10_000,
      accountCount: 1,
      consentFlags: null,
      pushToken: "ExponentPushToken[x]",
      recentCategoryCount: 3, // default credits cap
      now: new Date("2026-08-26T12:00:00.000Z"),
      insertQueued,
      markStatus: vi.fn(),
    });
    expect(result).toEqual({ status: "skipped" });
    expect(insertQueued).not.toHaveBeenCalled();
  });

  it("skips found-money when total is zero", async () => {
    const result = await deliverFoundMoneyWaiting({
      totalMinor: 0,
      accountCount: 0,
      consentFlags: null,
      pushToken: null,
      recentCategoryCount: 0,
      insertQueued: vi.fn(),
      markStatus: vi.fn(),
    });
    expect(result).toEqual({ status: "skipped" });
  });

  it("delivers weekly digest under cap", async () => {
    const insertQueued = vi.fn(async () => ({ id: "d1" }));
    const result = await deliverWeeklyDigest({
      spendMinor: 12_000,
      avgCostPerWearMinor: 400,
      consentFlags: null,
      pushToken: null,
      recentCategoryCount: 0,
      now: new Date("2026-08-26T12:00:00.000Z"),
      insertQueued,
      markStatus: vi.fn(),
    });
    expect(result).toEqual({ status: "queued" });
    expect(insertQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          deepLink: "worn://vault?focus=found-money",
          androidChannelId: "worn-digest",
          amountMinor: 12_000,
        }),
      }),
    );
  });

  it("delivers monthly digest with spend + CPW highlight", async () => {
    const insertQueued = vi.fn(async () => ({ id: "m1" }));
    const result = await deliverMonthlyDigest({
      spendMinor: 88_000,
      avgCostPerWearMinor: 550,
      monthLabel: "2026-08",
      consentFlags: null,
      pushToken: null,
      recentCategoryCount: 0,
      now: new Date("2026-08-26T12:00:00.000Z"),
      insertQueued,
      markStatus: vi.fn(),
    });
    expect(result).toEqual({ status: "queued" });
    expect(insertQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          deepLink: "worn://accountant?month=2026-08",
          androidChannelId: "worn-digest",
          amountMinor: 88_000,
          monthLabel: "2026-08",
        }),
      }),
    );
  });

  it("respects quiet hours for digest", async () => {
    const result = await deliverWeeklyDigest({
      spendMinor: 1000,
      consentFlags: null,
      pushToken: "ExponentPushToken[x]",
      recentCategoryCount: 0,
      now: new Date("2026-08-26T23:00:00.000Z"),
      insertQueued: vi.fn(),
      markStatus: vi.fn(),
    });
    expect(result.status).toBe("delayed");
  });
});
