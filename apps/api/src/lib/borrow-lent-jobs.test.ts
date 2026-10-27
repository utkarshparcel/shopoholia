import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({ id: "job-1" })),
  close: vi.fn(async () => undefined),
  failAdd: false,
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      if (queueMocks.failAdd) return Promise.reject(new Error("enqueue failed"));
      return queueMocks.add(...args);
    }
    close() {
      return queueMocks.close();
    }
  },
}));

import {
  LENT_OVERDUE_EVENT,
  LENT_OVERDUE_JOB,
  LENT_OVERDUE_QUEUE,
  computeLentOverdueDelayMs,
  lentOverdueJobId,
  processLentOverdueNudge,
  scheduleLentOverdueNudge,
} from "./borrow-lent-jobs.js";

describe("computeLentOverdueDelayMs", () => {
  it("returns null for invalid dueOn", () => {
    expect(computeLentOverdueDelayMs("not-a-date")).toBeNull();
  });

  it("fires ASAP when already past first overdue morning", () => {
    const now = new Date("2026-08-28T12:00:00+05:30");
    expect(
      computeLentOverdueDelayMs("2026-08-20", { now, timeZone: "Asia/Kolkata" }),
    ).toBe(100);
  });

  it("schedules local morning on the day after due", () => {
    const now = new Date("2026-08-26T10:00:00+05:30");
    const delay = computeLentOverdueDelayMs("2026-08-28", {
      now,
      timeZone: "Asia/Kolkata",
    });
    expect(delay).toBeGreaterThan(86_400_000);
  });
});

describe("scheduleLentOverdueNudge", () => {
  const prevRedis = process.env.REDIS_URL;
  const prevWardrobeRedis = process.env.WARDROBE_REDIS_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
    delete process.env.REDIS_URL;
    delete process.env.WARDROBE_REDIS_URL;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
    if (prevWardrobeRedis === undefined) delete process.env.WARDROBE_REDIS_URL;
    else process.env.WARDROBE_REDIS_URL = prevWardrobeRedis;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("skips when Redis is missing", async () => {
    expect(
      await scheduleLentOverdueNudge({
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        lentTo: "Riya",
        dueOn: "2026-08-28",
      }),
    ).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it("publishes with stable jobId", async () => {
    process.env.WARDROBE_REDIS_URL = "redis://localhost:6379";
    const wardrobeItemId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const dueOn = "2026-08-28";
    const result = await scheduleLentOverdueNudge(
      {
        userId: "u1",
        wardrobeItemId,
        lentTo: "Riya",
        dueOn,
        category: "blazer",
      },
      { now: new Date("2026-08-26T10:00:00+05:30") },
    );
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      LENT_OVERDUE_JOB,
      expect.objectContaining({ wardrobeItemId, lentTo: "Riya", dueOn }),
      expect.objectContaining({
        jobId: lentOverdueJobId(wardrobeItemId, dueOn),
        delay: expect.any(Number),
      }),
    );
    expect(queueMocks.close).toHaveBeenCalled();
  });

  it("returns skipped when enqueue throws", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    queueMocks.failAdd = true;
    expect(
      await scheduleLentOverdueNudge({
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        lentTo: "Riya",
        dueOn: "2026-08-28",
      }),
    ).toBe("skipped");
  });
});

describe("processLentOverdueNudge", () => {
  it("skips when item was already returned", async () => {
    const recordPushEvent = vi.fn();
    const result = await processLentOverdueNudge(
      {
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        lentTo: "Riya",
        dueOn: "2026-08-20",
      },
      {
        recordPushEvent,
        findWardrobeItem: async () => ({ lentTo: null, lentDueOn: null }),
      },
    );
    expect(result).toEqual({ status: "skipped", reason: "returned" });
    expect(recordPushEvent).not.toHaveBeenCalled();
  });

  it("queues push when still lent", async () => {
    const recordPushEvent = vi.fn(async () => ({ id: "evt-1" }));
    const result = await processLentOverdueNudge(
      {
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        lentTo: "Riya",
        dueOn: "2026-08-20",
        category: "blazer",
      },
      {
        recordPushEvent,
        findUserById: async () => ({ consentFlags: {}, pushToken: null }),
        findWardrobeItem: async () => ({
          lentTo: "Riya",
          lentDueOn: "2026-08-20",
          category: "blazer",
        }),
      },
      { now: new Date("2026-08-26T12:00:00.000Z") },
    );

    expect(result.status).toBe("queued");
    expect(recordPushEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: LENT_OVERDUE_EVENT,
        dedupeKey: lentOverdueJobId(
          "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          "2026-08-20",
        ),
      }),
    );
  });

  it("exposes queue name constant", () => {
    expect(LENT_OVERDUE_QUEUE).toBe("lent-overdue");
  });
});
