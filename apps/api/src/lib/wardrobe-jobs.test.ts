import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({})),
  close: vi.fn(async () => {}),
  failCtor: false,
  failAdd: false,
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    constructor() {
      if (queueMocks.failCtor) throw new Error("redis down");
    }
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
  DEFAULT_OUTFIT_TZ,
  localDayKey,
  msUntilLocalHour,
  outfitJobId,
  resolveUserTimeZone,
  scheduleMorningOutfit,
  scheduleNightlyOutfit,
  utcMsForLocalWallClock,
} from "./wardrobe-jobs.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

describe("morning outfit schedule helpers", () => {
  it("resolves timezone from users.time_zone", () => {
    expect(resolveUserTimeZone(null)).toBe(DEFAULT_OUTFIT_TZ);
    expect(resolveUserTimeZone({ timeZone: null })).toBe(DEFAULT_OUTFIT_TZ);
    expect(resolveUserTimeZone({ timeZone: "Not/AZone" })).toBe(DEFAULT_OUTFIT_TZ);
    expect(resolveUserTimeZone({ timeZone: "Europe/London" })).toBe("Europe/London");
  });

  it("builds stable idempotent jobId", () => {
    expect(outfitJobId("user-1", "2026-08-26")).toBe("outfit:user-1:2026-08-26");
    expect(outfitJobId("user-1", "2026-08-26")).toBe(outfitJobId("user-1", "2026-08-26"));
  });

  it("formats local day key in Asia/Kolkata", () => {
    // 2026-08-26 22:30 UTC = 2026-08-27 04:00 IST
    const key = localDayKey(new Date("2026-08-26T22:30:00.000Z"), "Asia/Kolkata");
    expect(key).toBe("2026-08-27");
  });

  it("computes ms until next 7am local (before 7am same day)", () => {
    // 2026-08-26 01:00 IST = 2026-08-25 19:30 UTC
    const now = new Date("2026-08-25T19:30:00.000Z");
    const delay = msUntilLocalHour(now, "Asia/Kolkata", 7);
    const fireAt = new Date(now.getTime() + delay);
    const parts = localDayKey(fireAt, "Asia/Kolkata");
    expect(parts).toBe("2026-08-26");
    // Should fire at 7:00 IST = 01:30 UTC
    expect(fireAt.toISOString()).toBe("2026-08-26T01:30:00.000Z");
  });

  it("rolls to next day when already past 7am local", () => {
    // 2026-08-26 08:00 IST = 2026-08-26 02:30 UTC
    const now = new Date("2026-08-26T02:30:00.000Z");
    const delay = msUntilLocalHour(now, "Asia/Kolkata", 7);
    const fireAt = new Date(now.getTime() + delay);
    expect(localDayKey(fireAt, "Asia/Kolkata")).toBe("2026-08-27");
    expect(fireAt.toISOString()).toBe("2026-08-27T01:30:00.000Z");
  });

  it("utcMsForLocalWallClock is stable for IST offset", () => {
    const ms = utcMsForLocalWallClock(2026, 8, 26, 7, 0, "Asia/Kolkata");
    expect(new Date(ms).toISOString()).toBe("2026-08-26T01:30:00.000Z");
  });
});

describe("scheduleMorningOutfit", () => {
  const originalRedis = process.env.REDIS_URL;
  const originalWardrobeRedis = process.env.WARDROBE_REDIS_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.WARDROBE_REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failCtor = false;
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
    if (originalWardrobeRedis) process.env.WARDROBE_REDIS_URL = originalWardrobeRedis;
    else delete process.env.WARDROBE_REDIS_URL;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("skips when Redis URL is missing", async () => {
    expect(await scheduleMorningOutfit("user-1")).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it("publishes with idempotent jobId and morning trigger", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const now = new Date("2026-08-26T02:30:00.000Z"); // past 7am IST → next day
    expect(await scheduleMorningOutfit("user-1", { now, timeZone: "Asia/Kolkata" })).toBe(
      "published",
    );
    expect(queueMocks.add).toHaveBeenCalledWith(
      "outfit-generate",
      { userId: "user-1", trigger: "morning", timeZone: "Asia/Kolkata" },
      expect.objectContaining({
        jobId: jobIdFrom("outfit:user-1:2026-08-27"),
        delay: expect.any(Number),
      }),
    );
  });

  it("schedules for the next local 7am when now is omitted", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    expect(await scheduleMorningOutfit("user-1")).toBe("published");
    const options = queueMocks.add.mock.calls.at(-1)![2] as { delay: number };
    expect(options.delay).toBeGreaterThan(0);
    expect(options.delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.failAdd = true;
    await expect(scheduleMorningOutfit("user-2")).rejects.toBeInstanceOf(QueueUnavailableError);
  });

  it("scheduleNightlyOutfit aliases scheduleMorningOutfit", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    process.env.NODE_ENV = "test";
    expect(await scheduleNightlyOutfit("user-3")).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "outfit-generate",
      expect.objectContaining({ userId: "user-3", trigger: "morning" }),
      expect.any(Object),
    );
  });
});
