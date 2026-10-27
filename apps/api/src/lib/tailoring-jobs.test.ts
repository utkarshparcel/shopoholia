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
    close() {
      return queueMocks.close();
    }
  },
}));

import {
  nextTailorState,
  processTailoringTransition,
  scheduleNextTailoring,
  scheduleTailoringTransitions,
} from "./tailoring-jobs.js";

describe("nextTailorState", () => {
  it("walks the PENDING → DELIVERED ladder", () => {
    expect(nextTailorState("PENDING")).toEqual({ next: "CONFIRMED", delayMs: 60 * 60 * 1000 });
    expect(nextTailorState("SHIPPED")?.next).toBe("DELIVERED");
    expect(nextTailorState("DELIVERED")).toBeNull();
  });
});

describe("scheduleTailoringTransitions", () => {
  const originalRedis = process.env.REDIS_URL;
  const originalTailorRedis = process.env.TAILORING_REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.TAILORING_REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
    if (originalTailorRedis) process.env.TAILORING_REDIS_URL = originalTailorRedis;
    else delete process.env.TAILORING_REDIS_URL;
  });

  it("skips without Redis", async () => {
    expect(await scheduleTailoringTransitions({ orderId: "o1", userId: "u1" })).toBe("skipped");
  });

  it("publishes PENDING → CONFIRMED", async () => {
    process.env.TAILORING_REDIS_URL = "redis://localhost:6379";
    expect(await scheduleTailoringTransitions({ orderId: "o1", userId: "u1" })).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "tailoring-state-transition",
      { orderId: "o1", userId: "u1" },
      expect.objectContaining({ jobId: "tailor:o1:CONFIRMED" }),
    );
  });

  it("scheduleNextTailoring skips terminal states", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    expect(await scheduleNextTailoring("DELIVERED", { orderId: "o1", userId: "u1" })).toBe("skipped");
  });

  it("scheduleNextTailoring publishes mid-ladder transitions", async () => {
    process.env.TAILORING_REDIS_URL = "redis://localhost:6379";
    expect(await scheduleNextTailoring("CONFIRMED", { orderId: "o1", userId: "u1" })).toBe(
      "published",
    );
    expect(queueMocks.add).toHaveBeenCalledWith(
      "tailoring-state-transition",
      { orderId: "o1", userId: "u1" },
      expect.objectContaining({ jobId: "tailor:o1:IN_STITCHING" }),
    );
  });

  it("scheduleNextTailoring returns skipped when enqueue throws", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    queueMocks.failAdd = true;
    expect(await scheduleNextTailoring("SHIPPED", { orderId: "o1", userId: "u1" })).toBe("skipped");
  });

  it("returns skipped when enqueue throws", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    queueMocks.failAdd = true;
    expect(await scheduleTailoringTransitions({ orderId: "o1", userId: "u1" })).toBe("skipped");
  });
});

describe("processTailoringTransition", () => {
  it("advances state and records a push when the order exists", async () => {
    delete process.env.REDIS_URL;
    delete process.env.TAILORING_REDIS_URL;
    const findTailoringOrder = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "o1", state: "PENDING" });
    const updateTailoringOrderState = vi.fn().mockResolvedValue({ id: "o1" });
    const recordPushEvent = vi.fn().mockResolvedValue({ id: "evt" });

    await processTailoringTransition(
      { orderId: "missing", userId: "u1" },
      { findTailoringOrder, updateTailoringOrderState, recordPushEvent },
    );
    expect(updateTailoringOrderState).not.toHaveBeenCalled();

    await processTailoringTransition(
      { orderId: "o1", userId: "u1" },
      { findTailoringOrder, updateTailoringOrderState, recordPushEvent },
    );
    expect(updateTailoringOrderState).toHaveBeenCalledWith("o1", "CONFIRMED");
    expect(recordPushEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "tailoring_update",
        dedupeKey: "tailoring:o1:CONFIRMED",
      }),
    );
  });
});
