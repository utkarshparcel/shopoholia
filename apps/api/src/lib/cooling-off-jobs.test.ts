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

import {
  COOLING_OFF_JOB,
  computeCoolingOffReleaseDelayMs,
  coolingOffReleaseCopy,
  holdToReleasePayload,
  processCoolingOffRelease,
  scheduleCoolingOffRelease,
} from "./cooling-off-jobs.js";
import { COOLING_OFF_MS, computeHoldWindow } from "./cooling-off.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

describe("cooling-off release job (N34)", () => {
  const originalRedis = process.env.REDIS_URL;
  const originalCoolingRedis = process.env.COOLING_OFF_REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.COOLING_OFF_REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
    if (originalCoolingRedis) process.env.COOLING_OFF_REDIS_URL = originalCoolingRedis;
    else delete process.env.COOLING_OFF_REDIS_URL;
  });

  it("delay is releaseAt − now; null when already released", () => {
    const now = Date.parse("2026-08-26T10:00:00.000Z");
    const releaseAt = new Date(now + COOLING_OFF_MS);
    expect(computeCoolingOffReleaseDelayMs(releaseAt, now)).toBe(COOLING_OFF_MS);
    expect(computeCoolingOffReleaseDelayMs(releaseAt, now + COOLING_OFF_MS)).toBeNull();
  });

  it("skips schedule when Redis missing", async () => {
    const hold = computeHoldWindow(
      new Date(),
      { category: "APPAREL", projectedMinor: 1, limitMinor: 1 },
      "fp",
    );
    expect(await scheduleCoolingOffRelease(holdToReleasePayload("u1", hold))).toBe("skipped");
  });

  it("publishes delayed release job", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const hold = {
      heldAt: new Date().toISOString(),
      releaseAt: new Date(Date.now() + COOLING_OFF_MS).toISOString(),
      category: "APPAREL",
      projectedMinor: 12_000,
      limitMinor: 10_000,
      cartFingerprint: "v1:1",
    };
    expect(await scheduleCoolingOffRelease(holdToReleasePayload("u1", hold))).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      COOLING_OFF_JOB,
      expect.objectContaining({ userId: "u1", category: "APPAREL" }),
      expect.objectContaining({
        // Keyed on the release time too: a new hold on the same cart is a new job.
        jobId: jobIdFrom("cooling-off", "u1", "v1:1", hold.releaseAt),
      }),
    );
    const opts = queueMocks.add.mock.calls[0]?.[2] as { delay: number };
    expect(opts.delay).toBeGreaterThan(COOLING_OFF_MS - 5_000);
    expect(opts.delay).toBeLessThanOrEqual(COOLING_OFF_MS);
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.failAdd = true;
    const hold = computeHoldWindow(
      new Date(Date.now() + 1000),
      { category: "APPAREL", projectedMinor: 1, limitMinor: 1 },
      "fp",
    );
    // releaseAt is in the future relative to heldAt, but delay uses releaseAt vs now
    const futureHold = {
      ...hold,
      heldAt: new Date().toISOString(),
      releaseAt: new Date(Date.now() + COOLING_OFF_MS).toISOString(),
    };
    await expect(
      scheduleCoolingOffRelease(holdToReleasePayload("u1", futureHold)),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });

  it("processCoolingOffRelease queues notify push when hold ends", async () => {
    const heldAt = new Date("2026-08-25T10:00:00.000Z");
    const hold = computeHoldWindow(
      heldAt,
      { category: "APPAREL", projectedMinor: 12_000, limitMinor: 10_000 },
      "fp",
    );
    const recordPushEvent = vi.fn().mockResolvedValue({ id: "evt-1" });
    const updatePushEventStatus = vi.fn().mockResolvedValue(undefined);
    const sendExpo = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "ticket-1",
      status: "ok",
    });

    const result = await processCoolingOffRelease(
      holdToReleasePayload("u1", hold),
      {
        recordPushEvent,
        findUserById: async () => ({
          consentFlags: { coolingOff: hold },
          prefs: {},
          timeZone: "Asia/Kolkata",
          pushToken: "ExponentPushToken[test]",
        }),
        updatePushEventStatus,
      },
      {
        now: new Date(heldAt.getTime() + COOLING_OFF_MS + 1),
        sendExpo,
      },
    );

    expect(result.status).toBe("sent");
    expect(recordPushEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "cooling_off_released",
        dedupeKey: expect.stringContaining("cooling-off-released:u1:"),
      }),
    );
    expect(coolingOffReleaseCopy("APPAREL").title).toMatch(/cooling-off ended/i);
  }, 20_000);

  it("processCoolingOffRelease skips once the hold was cleared or replaced", async () => {
    const heldAt = new Date("2026-08-25T10:00:00.000Z");
    const hold = computeHoldWindow(
      heldAt,
      { category: "APPAREL", projectedMinor: 12_000, limitMinor: 10_000 },
      "fp",
    );
    const sendExpo = vi.fn();
    const recordPushEvent = vi.fn();
    const later = computeHoldWindow(
      new Date(heldAt.getTime() + 2 * COOLING_OFF_MS),
      { category: "APPAREL", projectedMinor: 12_000, limitMinor: 10_000 },
      "fp2",
    );
    // Checked out or overrode (flag cleared), then a newer hold (another release time).
    for (const consentFlags of [{}, { coolingOff: later }]) {
      const result = await processCoolingOffRelease(
        holdToReleasePayload("u1", hold),
        {
          recordPushEvent,
          findUserById: async () => ({
            consentFlags,
            prefs: {},
            timeZone: "Asia/Kolkata",
            pushToken: "ExponentPushToken[test]",
          }),
        },
        { now: new Date(heldAt.getTime() + COOLING_OFF_MS + 1), sendExpo },
      );
      expect(result.status).toBe("skipped");
    }
    expect(recordPushEvent).not.toHaveBeenCalled();
    expect(sendExpo).not.toHaveBeenCalled();
  });
});
