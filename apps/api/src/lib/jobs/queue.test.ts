import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStateEta } from "../orders/state-machine.js";
import { createStubPushService } from "../push/stub.js";
import { createMemoryRepositories } from "../repositories/memory.js";
import type { Repositories } from "../repositories/types.js";
import { createOrderTransitionHandler, type OrderTransitionJob } from "./order-processing.js";
import { createMemoryJobQueue, type JobHandler } from "./queue.js";

type Wrap = (handler: JobHandler<OrderTransitionJob>) => JobHandler<OrderTransitionJob>;

/** Adds latency to order reads and writes, like a round trip to Postgres. */
function withOrderLatency(repos: Repositories, ms: number): Repositories {
  const delay = () => new Promise((resolve) => setTimeout(resolve, ms));
  return {
    ...repos,
    async findOrderById(id) {
      await delay();
      return repos.findOrderById(id);
    },
    async updateOrderState(orderId, state, patch) {
      await delay();
      return repos.updateOrderState(orderId, state, patch);
    },
  };
}

/**
 * `repos` is the plain in-memory store for arranging and asserting; the queue and
 * transition handler see it through `latencyMs` of simulated database latency.
 */
function setup({ wrap = (handler) => handler, latencyMs = 0 }: { wrap?: Wrap; latencyMs?: number } = {}) {
  const repos = createMemoryRepositories();
  const queueRepos = latencyMs > 0 ? withOrderLatency(repos, latencyMs) : repos;
  const onDelivered = vi.fn(async () => undefined);
  const transition = createOrderTransitionHandler({
    repos: queueRepos,
    push: createStubPushService(queueRepos),
    onDelivered,
  });
  const queue = createMemoryJobQueue(
    {
      avatar: vi.fn(),
      tryon: vi.fn(),
      orderTransition: wrap(transition),
      deliveredRender: vi.fn(),
      render: vi.fn(),
    },
    { repos: queueRepos, autoProcess: true },
  );
  return { repos, queue, onDelivered };
}

async function createOrder(repos: Repositories, placedAt: Date) {
  const { user } = await repos.createUser("919876543210");
  const { order } = await repos.createOrder({
    userId: user.id,
    tier: "EXPRESS",
    coinTotal: 0,
    stateEta: buildStateEta(placedAt, "EXPRESS"),
    items: [],
  });
  return order;
}

describe("createMemoryJobQueue order ladder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves the order along at each step's stateEta time", async () => {
    // Beta EXPRESS: packed at 1m, out for delivery at 2m, arriving at 3m, delivered at 5m.
    const { repos, queue, onDelivered } = setup();
    const order = await createOrder(repos, new Date());
    await queue.scheduleOrderLadder(order.id);

    const stateAfter = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      return (await repos.findOrderById(order.id))!.state;
    };

    expect(await stateAfter(59_000)).toBe("PROCESSING");
    expect(await stateAfter(1_000)).toBe("PACKED");
    expect(await stateAfter(59_000)).toBe("PACKED");
    expect(await stateAfter(1_000)).toBe("OUT_FOR_DELIVERY");
    expect(await stateAfter(59_000)).toBe("OUT_FOR_DELIVERY");
    expect(await stateAfter(1_000)).toBe("ARRIVING_SOON");
    expect(await stateAfter(119_000)).toBe("ARRIVING_SOON");
    expect(await stateAfter(1_000)).toBe("DELIVERED");
    expect(onDelivered).toHaveBeenCalledExactlyOnceWith(order.id);
  });

  it("reaches DELIVERED when every step waits on the database", async () => {
    const { repos, queue, onDelivered } = setup({ latencyMs: 10 });
    const order = await createOrder(repos, new Date());

    const scheduling = queue.scheduleOrderLadder(order.id);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await scheduling;

    expect((await repos.findOrderById(order.id))!.state).toBe("DELIVERED");
    expect(onDelivered).toHaveBeenCalledOnce();
  });

  it("runs overdue steps one at a time, in order", async () => {
    const applied: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const { repos, queue } = setup({
      latencyMs: 10,
      wrap: (handler) => async (job) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await handler(job);
        applied.push(job.targetState);
        inFlight -= 1;
      },
    });
    const order = await createOrder(repos, new Date(Date.now() - 10 * 60_000));

    const scheduling = queue.scheduleOrderLadder(order.id);
    await vi.advanceTimersByTimeAsync(1_000);
    await scheduling;

    expect(applied).toEqual(["PACKED", "OUT_FOR_DELIVERY", "ARRIVING_SOON", "DELIVERED"]);
    expect(maxInFlight).toBe(1);
    expect((await repos.findOrderById(order.id))!.state).toBe("DELIVERED");
  });

  it("only schedules the steps after the order's current state", async () => {
    const targets: string[] = [];
    const { repos, queue } = setup({
      wrap: (handler) => async (job) => {
        targets.push(job.targetState);
        await handler(job);
      },
    });
    const order = await createOrder(repos, new Date());
    await repos.updateOrderState(order.id, "OUT_FOR_DELIVERY");

    await queue.scheduleOrderLadder(order.id);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(targets).toEqual(["ARRIVING_SOON", "DELIVERED"]);
  });

  it("schedules nothing for orders past delivery", async () => {
    const targets: string[] = [];
    const { repos, queue } = setup({
      wrap: (handler) => async (job) => {
        targets.push(job.targetState);
        await handler(job);
      },
    });
    const order = await createOrder(repos, new Date());
    await repos.updateOrderState(order.id, "REVEAL_READY");

    await queue.scheduleOrderLadder(order.id);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(targets).toEqual([]);
  });
});
