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
    on() {
      return this;
    }
    close() {
      return queueMocks.close();
    }
  },
}));

import {
  DRY_CLEAN_JOB,
  DRY_CLEAN_PICKUP_EVENT,
  DRY_CLEAN_QUEUE,
  computeDryCleanPickupDelayMs,
  dryCleanPickupJobId,
  processDryCleanPickup,
  scheduleDryCleanPickup,
} from "./dry-clean-jobs.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

describe("computeDryCleanPickupDelayMs", () => {
  it("returns null for past pickup days", () => {
    const now = new Date("2026-08-28T10:00:00+05:30");
    expect(
      computeDryCleanPickupDelayMs("2026-08-20", { now, timeZone: "Asia/Kolkata" }),
    ).toBeNull();
  });

  it("fires ASAP when already on pickup morning", () => {
    const now = new Date("2026-08-28T11:00:00+05:30");
    expect(
      computeDryCleanPickupDelayMs("2026-08-28", { now, timeZone: "Asia/Kolkata" }),
    ).toBe(100);
  });

  it("schedules future pickup morning", () => {
    const now = new Date("2026-08-26T10:00:00+05:30");
    const delay = computeDryCleanPickupDelayMs("2026-08-28", {
      now,
      timeZone: "Asia/Kolkata",
    });
    expect(delay).toBeGreaterThan(86_400_000);
  });
});

describe("scheduleDryCleanPickup", () => {
  const prevRedis = process.env.REDIS_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  const pickupMorning = { now: new Date("2026-08-28T11:00:00+05:30") };

  it("publishes with stable jobId", async () => {
    const result = await scheduleDryCleanPickup(
      {
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ticket: "DC-1",
        pickupOn: "2026-08-28",
      },
      pickupMorning,
    );
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      DRY_CLEAN_JOB,
      expect.objectContaining({ ticket: "DC-1", pickupOn: "2026-08-28" }),
      expect.objectContaining({
        jobId: jobIdFrom(dryCleanPickupJobId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "2026-08-28")),
        delay: 100,
      }),
    );
  });

  it("skips when Redis missing", async () => {
    delete process.env.REDIS_URL;
    delete process.env.WARDROBE_REDIS_URL;
    expect(
      await scheduleDryCleanPickup({
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ticket: "DC-1",
        pickupOn: "2026-08-28",
      }),
    ).toBe("skipped");
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    queueMocks.failAdd = true;
    await expect(
      scheduleDryCleanPickup(
        {
          userId: "u1",
          wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          ticket: "DC-1",
          pickupOn: "2026-08-28",
        },
        pickupMorning,
      ),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});

describe("processDryCleanPickup", () => {
  it("queues push when item still at cleaner", async () => {
    const recordPushEvent = vi.fn(async () => ({ id: "pe-1" }));
    const result = await processDryCleanPickup(
      {
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ticket: "DC-9",
        pickupOn: "2026-08-28",
        category: "blazer",
      },
      {
        recordPushEvent,
        findUserById: async () => ({ prefs: {}, timeZone: "Asia/Kolkata", pushToken: null }),
        findWardrobeItem: async () => ({
          dryCleanTicket: "DC-9",
          laundryStatus: "IN_LAUNDRY",
          category: "blazer",
        }),
      },
      { now: new Date("2026-08-28T09:05:00Z") },
    );
    expect(result.status).toBe("queued");
    expect(recordPushEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DRY_CLEAN_PICKUP_EVENT }),
    );
  });

  it("skips when already confirmed", async () => {
    const result = await processDryCleanPickup(
      {
        userId: "u1",
        wardrobeItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ticket: "DC-9",
        pickupOn: "2026-08-28",
      },
      {
        recordPushEvent: async () => ({ id: "x" }),
        findWardrobeItem: async () => ({
          dryCleanTicket: null,
          laundryStatus: "CLEAN",
        }),
      },
    );
    expect(result).toEqual({ status: "skipped", reason: "not_at_cleaner" });
  });
});

describe("constants", () => {
  it("exposes queue name", () => {
    expect(DRY_CLEAN_QUEUE).toBe("dry-clean-pickup");
  });
});
