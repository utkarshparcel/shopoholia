import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({})),
  close: vi.fn(async () => {}),
  failAdd: false,
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    add(...args: unknown[]) {
      if (queueMocks.failAdd) return Promise.reject(new Error("enqueue failed"));
      return queueMocks.add(...args);
    }
    on() {
      return this;
    }
    close() {
      return queueMocks.close();
    }
  },
}));

import { scheduleGiftOccasionReminders, processGiftOccasion } from "./gift-jobs.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

describe("scheduleGiftOccasionReminders", () => {
  const originalRedis = process.env.REDIS_URL;
  const originalGiftRedis = process.env.GIFT_REDIS_URL;
  const now = new Date("2026-08-26T12:00:00.000Z");

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.GIFT_REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
    if (originalGiftRedis) process.env.GIFT_REDIS_URL = originalGiftRedis;
    else delete process.env.GIFT_REDIS_URL;
  });

  it("skips when Redis is missing", async () => {
    expect(
      await scheduleGiftOccasionReminders(
        {
          userId: "u1",
          recipientId: "r1",
          importantDates: [{ occasion: "BIRTHDAY", date: "2026-09-10T00:00:00.000Z" }],
        },
        { now },
      ),
    ).toBe("skipped");
  });

  it("publishes future occasions and skips past ones", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const result = await scheduleGiftOccasionReminders(
      {
        userId: "u1",
        recipientId: "r1",
        importantDates: [
          { occasion: "BIRTHDAY", date: "2026-09-10T00:00:00.000Z" },
          { occasion: "ANNIVERSARY", date: "2026-08-01T00:00:00.000Z" },
        ],
      },
      { now },
    );
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledTimes(1);
    expect(queueMocks.add).toHaveBeenCalledWith(
      "gift-occasion-reminder",
      expect.objectContaining({ occasion: "BIRTHDAY", date: "2026-09-10T00:00:00.000Z" }),
      expect.objectContaining({
        jobId: jobIdFrom("gift:r1:BIRTHDAY:2026-09-10T00:00:00.000Z"),
        delay: expect.any(Number),
      }),
    );
  });

  it("publishes festival + birthday with festival 12d lead", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const result = await scheduleGiftOccasionReminders(
      {
        userId: "u1",
        recipientId: "r1",
        importantDates: [
          { occasion: "FESTIVAL", date: "2026-11-08T00:00:00.000Z", label: "Diwali" },
          { occasion: "BIRTHDAY", date: "2026-09-10T00:00:00.000Z" },
        ],
      },
      { now },
    );
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledTimes(2);
    const festivalCall = queueMocks.add.mock.calls.find(
      (c) => (c[1] as { occasion: string }).occasion === "FESTIVAL",
    );
    expect(festivalCall?.[1]).toMatchObject({ label: "Diwali" });
  });

  it("returns skipped when all dates are in the past", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    expect(
      await scheduleGiftOccasionReminders(
        {
          userId: "u1",
          recipientId: "r1",
          importantDates: [{ occasion: "BIRTHDAY", date: "2020-01-01T00:00:00.000Z" }],
        },
        { now },
      ),
    ).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.failAdd = true;
    await expect(
      scheduleGiftOccasionReminders(
        {
          userId: "u1",
          recipientId: "r1",
          importantDates: [{ occasion: "BIRTHDAY", date: "2026-09-10T00:00:00.000Z" }],
        },
        { now },
      ),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});

describe("processGiftOccasion", () => {
  it("queues push and marks SENT on Expo success", async () => {
    const recordPushEvent = vi.fn().mockResolvedValue({ id: "evt-1" });
    const updatePushEventStatus = vi.fn().mockResolvedValue(undefined);
    const sendExpo = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "ticket-1",
      status: "ok",
    });

    const result = await processGiftOccasion(
      {
        userId: "u1",
        recipientId: "r1",
        occasion: "BIRTHDAY",
        date: "2099-06-01T00:00:00.000Z",
      },
      {
        recordPushEvent,
        findUserById: async () => ({
          prefs: {},
          timeZone: "Asia/Kolkata",
          pushToken: "ExponentPushToken[test]",
        }),
        updatePushEventStatus,
      },
      {
        now: new Date("2026-08-26T12:00:00.000Z"),
        sendExpo,
      },
    );

    expect(result.status).toBe("sent");
    expect(recordPushEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "gift_occasion",
        dedupeKey: "gift-occasion:r1:BIRTHDAY:2099-06-01T00:00:00.000Z",
      }),
    );
    expect(updatePushEventStatus).toHaveBeenCalledWith("evt-1", "SENT", "ticket-1");
  });

  it("leaves event QUEUED when findUserById is absent (no push token)", async () => {
    const recordPushEvent = vi.fn().mockResolvedValue({ id: "evt-2" });
    const updatePushEventStatus = vi.fn().mockResolvedValue(undefined);

    const result = await processGiftOccasion(
      {
        userId: "u1",
        recipientId: "r2",
        occasion: "ANNIVERSARY",
        date: "2099-07-01T00:00:00.000Z",
      },
      {
        recordPushEvent,
        updatePushEventStatus,
      },
      {
        now: new Date("2026-08-26T12:00:00.000Z"),
        sendExpo: vi.fn(),
      },
    );

    expect(result.status).toBe("queued");
    expect(recordPushEvent).toHaveBeenCalled();
    expect(updatePushEventStatus).not.toHaveBeenCalled();
  });

  it("marks FAILED when Expo delivery errors", async () => {
    const recordPushEvent = vi.fn().mockResolvedValue({ id: "evt-3" });
    const updatePushEventStatus = vi.fn().mockResolvedValue(undefined);

    const result = await processGiftOccasion(
      {
        userId: "u1",
        recipientId: "r3",
        occasion: "FESTIVAL",
        date: "2099-10-01T00:00:00.000Z",
        label: "Diwali",
      },
      {
        recordPushEvent,
        findUserById: async () => ({
          prefs: {},
          timeZone: "Asia/Kolkata",
          pushToken: "ExponentPushToken[test]",
        }),
        updatePushEventStatus,
      },
      {
        now: new Date("2026-08-26T12:00:00.000Z"),
        sendExpo: vi.fn().mockResolvedValue({ ok: false, error: "DeviceNotRegistered" }),
      },
    );

    expect(result.status).toBe("failed");
    expect(updatePushEventStatus).toHaveBeenCalledWith("evt-3", "FAILED", null);
  });

  it("delays inside quiet hours before enqueue", async () => {
    const recordPushEvent = vi.fn();
    const result = await processGiftOccasion(
      {
        userId: "u1",
        recipientId: "r4",
        occasion: "BIRTHDAY",
        date: "2099-06-01T00:00:00.000Z",
      },
      {
        recordPushEvent,
        findUserById: async () => ({
          prefs: null,
          pushToken: "ExponentPushToken[test]",
        }),
      },
      {
        now: new Date("2026-08-26T23:30:00.000Z"),
        sendExpo: vi.fn(),
      },
    );

    expect(result.status).toBe("delayed");
    if (result.status === "delayed") {
      expect(result.delayMs).toBeGreaterThan(0);
    }
    expect(recordPushEvent).not.toHaveBeenCalled();
  });
});
