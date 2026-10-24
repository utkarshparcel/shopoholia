import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStateEta } from "../orders/state-machine.js";
import { createStubPushService } from "../push/stub.js";
import { seedOrderRenders } from "../render/pipeline.js";
import { createMockRenderProvider } from "../render/provider.js";
import { createMemoryRepositories } from "../repositories/memory.js";
import { createMockStorage } from "../storage/r2.js";
import { createOrderTransitionHandler } from "./order-processing.js";
import { createMemoryJobQueue } from "./queue.js";
import { createDeliveredRenderHandler, createRenderProcessingHandler } from "./render-processing.js";
import { resumeInFlightWork } from "./resume.js";

/** A freshly booted API process: empty job queue, data already in the database. */
function bootDeps() {
  const repos = createMemoryRepositories();
  const storage = createMockStorage();
  const renderProvider = createMockRenderProvider();
  const push = createStubPushService(repos);
  const jobQueue = createMemoryJobQueue(
    {
      avatar: vi.fn(),
      tryon: vi.fn(),
      orderTransition: createOrderTransitionHandler({
        repos,
        push,
        onDelivered: async (orderId) => jobQueue.enqueueDeliveredRender({ orderId }),
      }),
      deliveredRender: createDeliveredRenderHandler({
        repos,
        enqueueRender: async (job) => jobQueue.enqueueRender(job),
      }),
      render: createRenderProcessingHandler({ repos, storage, renderProvider, push }),
    },
    { repos, autoProcess: false },
  );
  return { repos, jobQueue, push };
}

async function createOrder(
  deps: ReturnType<typeof bootDeps>,
  { placedAt = new Date(), state }: { placedAt?: Date; state?: "DELIVERED" | "REVEAL_READY" } = {},
) {
  const { repos } = deps;
  const listingId = randomUUID();
  const variantId = randomUUID();
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Slip dress",
        category: "Dresses",
        tags: [],
        coinPrice: 100,
        realPrice: null,
        productImageKeys: [],
        houseModelRenderKey: "",
        affiliateUrl: null,
        affiliateLinks: null,
        status: "ACTIVE",
        sortOrder: 0,
        createdAt: new Date(),
      },
    ],
    [{ id: variantId, listingId, size: "S", color: "Black", garmentImageKey: "g.jpg" }],
  );
  const { user } = await repos.createUser(`91${randomUUID().replace(/\D/g, "").slice(0, 10)}`);
  const { order } = await repos.createOrder({
    userId: user.id,
    tier: "EXPRESS",
    coinTotal: 100,
    stateEta: buildStateEta(placedAt, "EXPRESS"),
    items: [{ listingVariantId: variantId, coinPriceSnapshot: 100, quantity: 1 }],
  });
  if (state) await repos.updateOrderState(order.id, state);
  return order;
}

async function stateOf(deps: ReturnType<typeof bootDeps>, orderId: string) {
  return (await deps.repos.findOrderById(orderId))!.state;
}

describe("resumeInFlightWork", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-arms delivery timers for orders still in transit", async () => {
    const deps = bootDeps();
    const order = await createOrder(deps, { placedAt: new Date(Date.now() - 60 * 60_000) });
    await deps.repos.updateOrderState(order.id, "OUT_FOR_DELIVERY");

    const summary = await resumeInFlightWork(deps);
    await deps.jobQueue.flushOrderTransitions!();
    await deps.jobQueue.flushRenderJobs!();

    expect(summary.ordersInTransit).toBe(1);
    expect(await stateOf(deps, order.id)).toBe("REVEAL_READY");
  });

  it("re-queues renders that were queued or cut off mid-generation", async () => {
    const deps = bootDeps();
    const order = await createOrder(deps, { state: "DELIVERED" });
    const renders = await seedOrderRenders(deps.repos, order.id);
    const [freeA, freeB] = renders.filter((r) => r.isFree);
    const [paidUnlocked, paidLocked] = renders.filter((r) => !r.isFree);
    await deps.repos.updateRender(freeA!.id, { status: "RUNNING" });
    await deps.repos.updateRender(paidUnlocked!.id, { unlocked: true });

    const summary = await resumeInFlightWork(deps);
    await deps.jobQueue.flushRenderJobs!();

    expect(summary.renders).toBe(3);
    const after = await deps.repos.findRendersByIds([
      freeA!.id,
      freeB!.id,
      paidUnlocked!.id,
      paidLocked!.id,
    ]);
    const statusById = new Map(after.map((r) => [r.id, r.status]));
    expect(statusById.get(freeA!.id)).toBe("DONE");
    expect(statusById.get(freeB!.id)).toBe("DONE");
    expect(statusById.get(paidUnlocked!.id)).toBe("DONE");
    expect(statusById.get(paidLocked!.id)).toBe("QUEUED");
    expect(await stateOf(deps, order.id)).toBe("REVEAL_READY");
  });

  it("creates reveal renders for delivered orders that have none yet", async () => {
    const deps = bootDeps();
    const order = await createOrder(deps, { state: "DELIVERED" });

    await resumeInFlightWork(deps);
    await deps.jobQueue.flushRenderJobs!();

    const renders = await deps.repos.findRendersByOrderId(order.id);
    expect(renders.filter((r) => r.isFree).every((r) => r.status === "DONE")).toBe(true);
    expect(await stateOf(deps, order.id)).toBe("REVEAL_READY");
  });

  it("moves on delivered orders whose free renders had already finished", async () => {
    const deps = bootDeps();
    const order = await createOrder(deps, { state: "DELIVERED" });
    const renders = await seedOrderRenders(deps.repos, order.id);
    for (const render of renders.filter((r) => r.isFree)) {
      await deps.repos.updateRender(render.id, { status: "DONE", imageKey: "reveal/x.jpg" });
    }

    await resumeInFlightWork(deps);

    expect(await stateOf(deps, order.id)).toBe("REVEAL_READY");
  });

  it("leaves finished orders alone", async () => {
    const deps = bootDeps();
    const order = await createOrder(deps, { state: "REVEAL_READY" });
    const enqueueRender = vi.spyOn(deps.jobQueue, "enqueueRender");
    const scheduleOrderLadder = vi.spyOn(deps.jobQueue, "scheduleOrderLadder");

    const summary = await resumeInFlightWork(deps);

    expect(summary).toEqual({ ordersInTransit: 0, deliveredOrders: 0, renders: 0 });
    expect(enqueueRender).not.toHaveBeenCalled();
    expect(scheduleOrderLadder).not.toHaveBeenCalled();
    expect(await stateOf(deps, order.id)).toBe("REVEAL_READY");
  });
});
