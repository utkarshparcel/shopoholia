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
  nextTailorState,
  processTailoringTransition,
  scheduleNextTailoring,
  scheduleTailoringTransitions,
  tailoringJobId,
} from "./tailoring-jobs.js";
import { QueueUnavailableError } from "./queues/enqueue.js";

describe("nextTailorState", () => {
  it("walks the PENDING → DELIVERED ladder", () => {
    expect(nextTailorState("PENDING")).toEqual({ next: "CONFIRMED", delayMs: 60 * 60 * 1000 });
    expect(nextTailorState("SHIPPED")?.next).toBe("DELIVERED");
    expect(nextTailorState("DELIVERED")).toBeNull();
  });
});

describe("scheduleTailoringTransitions", () => {
  const originalRedis = process.env.REDIS_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("skips without Redis", async () => {
    expect(await scheduleTailoringTransitions({ orderId: "o1", userId: "u1" })).toBe("skipped");
  });

  it("publishes PENDING → CONFIRMED with the target state", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    expect(await scheduleTailoringTransitions({ orderId: "o1", userId: "u1" })).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "tailoring-state-transition",
      { orderId: "o1", userId: "u1", toState: "CONFIRMED" },
      expect.objectContaining({ jobId: tailoringJobId("o1", "CONFIRMED") }),
    );
    expect(tailoringJobId("o1", "CONFIRMED")).not.toContain(":");
  });

  it("scheduleNextTailoring skips terminal states", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    expect(await scheduleNextTailoring("DELIVERED", { orderId: "o1", userId: "u1" })).toBe("skipped");
  });

  it("scheduleNextTailoring publishes mid-ladder transitions", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    expect(await scheduleNextTailoring("CONFIRMED", { orderId: "o1", userId: "u1" })).toBe(
      "published",
    );
    expect(queueMocks.add).toHaveBeenCalledWith(
      "tailoring-state-transition",
      { orderId: "o1", userId: "u1", toState: "IN_STITCHING" },
      expect.objectContaining({ jobId: tailoringJobId("o1", "IN_STITCHING") }),
    );
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.failAdd = true;
    await expect(
      scheduleNextTailoring("SHIPPED", { orderId: "o1", userId: "u1" }),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
    await expect(
      scheduleTailoringTransitions({ orderId: "o1", userId: "u1" }),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });

  it("the simulated ladder is off in production", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    process.env.NODE_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await scheduleTailoringTransitions({ orderId: "o1", userId: "u1" })).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
    info.mockRestore();
  });
});

describe("processTailoringTransition", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.add.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  /** A one-order store, so a second run sees what the first one wrote. */
  function makeRepos(state: string | null) {
    const order = state ? { id: "o1", state } : null;
    const pushes = new Map<string, Record<string, unknown>>();
    return {
      order,
      pushes,
      repos: {
        findTailoringOrder: vi.fn(async () => (order ? { ...order } : null)),
        updateTailoringOrderState: vi.fn(async (_id: string, next: string) => {
          if (!order) return null;
          order.state = next;
          return { id: order.id };
        }),
        recordPushEvent: vi.fn(async (input: Record<string, unknown>) => {
          pushes.set(String(input.dedupeKey), input);
          return { id: "evt" };
        }),
      },
    };
  }

  it("skips a missing order", async () => {
    const { repos } = makeRepos(null);
    await processTailoringTransition({ orderId: "missing", userId: "u1", toState: "CONFIRMED" }, repos);
    expect(repos.updateTailoringOrderState).not.toHaveBeenCalled();
    expect(repos.recordPushEvent).not.toHaveBeenCalled();
  });

  it("advances one step, records the push and schedules the next step", async () => {
    const { repos, order } = makeRepos("PENDING");
    await processTailoringTransition({ orderId: "o1", userId: "u1", toState: "CONFIRMED" }, repos);
    expect(order?.state).toBe("CONFIRMED");
    expect(repos.recordPushEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "tailoring_update",
        dedupeKey: "tailoring:o1:CONFIRMED",
      }),
    );
    expect(queueMocks.add).toHaveBeenCalledWith(
      "tailoring-state-transition",
      { orderId: "o1", userId: "u1", toState: "IN_STITCHING" },
      expect.objectContaining({ jobId: tailoringJobId("o1", "IN_STITCHING") }),
    );
  });

  it("running the same job twice advances only one step", async () => {
    const { repos, order, pushes } = makeRepos("PENDING");
    const payload = { orderId: "o1", userId: "u1", toState: "CONFIRMED" };
    await processTailoringTransition(payload, repos);
    await processTailoringTransition(payload, repos);
    expect(order?.state).toBe("CONFIRMED");
    expect(repos.updateTailoringOrderState).toHaveBeenCalledTimes(1);
    expect([...pushes.keys()]).toEqual(["tailoring:o1:CONFIRMED"]);
    // Both runs schedule the same next jobId, which BullMQ keeps as one job.
    const ids = new Set(queueMocks.add.mock.calls.map((c) => (c[2] as { jobId: string }).jobId));
    expect([...ids]).toEqual([tailoringJobId("o1", "IN_STITCHING")]);
  });

  it("a stale job for an order that has moved on does nothing", async () => {
    const { repos, order } = makeRepos("DELIVERED");
    await processTailoringTransition({ orderId: "o1", userId: "u1", toState: "IN_STITCHING" }, repos);
    expect(order?.state).toBe("DELIVERED");
    expect(repos.updateTailoringOrderState).not.toHaveBeenCalled();
    expect(repos.recordPushEvent).not.toHaveBeenCalled();
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it("a job from before toState existed moves the order's current step", async () => {
    const { repos, order } = makeRepos("CONFIRMED");
    await processTailoringTransition({ orderId: "o1", userId: "u1" }, repos);
    expect(order?.state).toBe("IN_STITCHING");
  });
});
