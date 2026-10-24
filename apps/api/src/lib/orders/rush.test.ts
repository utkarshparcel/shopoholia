import { RUSH_TO_EXPRESS_COST_COINS, type OrderState, type StateEta } from "@worn/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrderTransitionHandler } from "../jobs/order-processing.js";
import { createMemoryJobQueue, type JobQueue } from "../jobs/queue.js";
import { createStubPushService } from "../push/stub.js";
import { createMemoryRepositories } from "../repositories/memory.js";
import type { Repositories } from "../repositories/types.js";
import { planRushToExpress, RushError, rushOrderToExpress } from "./rush.js";
import { buildStateEta } from "./state-machine.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const placedAt = new Date("2026-09-29T10:00:00.000Z");
const at = (ms: number) => new Date(placedAt.getTime() + ms).toISOString();

// Prod timings. Express: packed 25m, out for delivery 85m, arriving 115m, delivered 2h.
// Standard: packed 3h, out for delivery 8h, arriving 10h, delivered 12h.
const EXPRESS_STEPS = {
  PACKED: at(25 * MINUTE),
  OUT_FOR_DELIVERY: at(85 * MINUTE),
  ARRIVING_SOON: at(115 * MINUTE),
  DELIVERED: at(120 * MINUTE),
};

function standardOrder(state: OrderState, stateEta?: StateEta) {
  return {
    tier: "STANDARD" as const,
    state,
    placedAt,
    stateEta: stateEta ?? buildStateEta(placedAt, "STANDARD"),
  };
}

beforeEach(() => {
  vi.stubEnv("WORN_ECONOMY_MODE", "prod");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("planRushToExpress", () => {
  it("moves every step still ahead to its Express time", () => {
    const plan = planRushToExpress(standardOrder("PROCESSING"), placedAt.getTime() + MINUTE);
    expect(plan).toEqual({ ok: true, stateEta: { PROCESSING: at(0), ...EXPRESS_STEPS } });
  });

  it("keeps the steps behind the order as they were", () => {
    const plan = planRushToExpress(standardOrder("PACKED"), placedAt.getTime() + 4 * HOUR);
    expect(plan).toEqual({
      ok: true,
      stateEta: { ...EXPRESS_STEPS, PROCESSING: at(0), PACKED: at(3 * HOUR) },
    });
  });

  it("never moves a step later than it was planned", () => {
    const stateEta = { ...buildStateEta(placedAt, "STANDARD"), PACKED: at(10 * MINUTE) };
    const plan = planRushToExpress(standardOrder("PROCESSING", stateEta), placedAt.getTime());
    expect(plan).toEqual({
      ok: true,
      stateEta: { PROCESSING: at(0), ...EXPRESS_STEPS, PACKED: at(10 * MINUTE) },
    });
  });

  it("fills in steps the order has no stored time for", () => {
    const plan = planRushToExpress(
      standardOrder("PROCESSING", { PROCESSING: at(0) }),
      placedAt.getTime(),
    );
    expect(plan).toEqual({ ok: true, stateEta: { PROCESSING: at(0), ...EXPRESS_STEPS } });
  });

  it("refuses an order that is already on Express", () => {
    const order = { ...standardOrder("PACKED"), tier: "EXPRESS" as const };
    expect(planRushToExpress(order, placedAt.getTime())).toEqual({
      ok: false,
      reason: "ALREADY_EXPRESS",
    });
  });

  it.each(["PENDING", "DELIVERED", "REVEAL_READY", "FAILED", "CANCELLED"] as const)(
    "refuses an order that is %s",
    (state) => {
      expect(planRushToExpress(standardOrder(state), placedAt.getTime())).toEqual({
        ok: false,
        reason: "NOT_IN_TRANSIT",
      });
    },
  );

  it("refuses when every tier runs on the same beta timings", () => {
    vi.stubEnv("WORN_ECONOMY_MODE", "beta");
    expect(planRushToExpress(standardOrder("PROCESSING"), placedAt.getTime())).toEqual({
      ok: false,
      reason: "NO_SPEEDUP",
    });
  });

  it("refuses when the steps left are already due", () => {
    // Only DELIVERED (12h) is left, and it's overdue.
    const plan = planRushToExpress(standardOrder("ARRIVING_SOON"), placedAt.getTime() + 13 * HOUR);
    expect(plan).toEqual({ ok: false, reason: "NO_SPEEDUP" });
  });

  it("counts a later step that would come sooner even when the next one is due", () => {
    // Out for delivery (8h) is due already; arriving (10h) and delivered (12h) are not.
    const plan = planRushToExpress(standardOrder("PACKED"), placedAt.getTime() + 9 * HOUR);
    expect(plan.ok).toBe(true);
  });
});

async function setup({ balance = 500, autoProcess = false } = {}) {
  const repos = createMemoryRepositories();
  const { user } = await repos.createUser("919876543210");
  await repos.grantCoins({ userId: user.id, delta: balance, type: "GRANT" });
  const onDelivered = vi.fn(async () => undefined);
  const jobQueue = createMemoryJobQueue(
    {
      avatar: vi.fn(),
      tryon: vi.fn(),
      orderTransition: createOrderTransitionHandler({
        repos,
        push: createStubPushService(repos),
        onDelivered,
      }),
      deliveredRender: vi.fn(),
      render: vi.fn(),
    },
    { repos, autoProcess },
  );
  const { order } = await repos.placeOrder({
    userId: user.id,
    tier: "STANDARD",
    coinTotal: 0,
    stateEta: buildStateEta(new Date(), "STANDARD"),
    items: [],
  });
  const rush = (deps: { repos: Repositories; jobQueue: JobQueue } = { repos, jobQueue }) =>
    rushOrderToExpress(deps, { userId: user.id, orderId: order.id });
  const rushSpends = async () =>
    (await repos.listCoinTransactions({ userId: user.id, limit: 50 })).transactions.filter(
      (tx) => tx.type === "SPEND_RUSH",
    );
  return { repos, jobQueue, user, order, onDelivered, rush, rushSpends };
}

describe("rushOrderToExpress", () => {
  it("charges the rush, switches the order to Express and re-arms its steps", async () => {
    const { repos, jobQueue, user, order, rush, rushSpends } = await setup();
    const schedule = vi.spyOn(jobQueue, "scheduleOrderLadder");

    const result = await rush();

    const expressEta = buildStateEta(order.placedAt, "EXPRESS");
    expect(result.order).toMatchObject({
      tier: "EXPRESS",
      state: "PROCESSING",
      stateEta: { ...expressEta, PROCESSING: order.stateEta.PROCESSING },
    });
    expect(result.balanceAfter).toBe(500 - RUSH_TO_EXPRESS_COST_COINS);
    expect(await repos.getCoinBalance(user.id)).toBe(result.balanceAfter);
    expect(await rushSpends()).toMatchObject([
      { delta: -RUSH_TO_EXPRESS_COST_COINS, refType: "order", refId: order.id },
    ]);
    expect(schedule).toHaveBeenCalledExactlyOnceWith(order.id);
  });

  it("gets the order delivered on Express time instead of Standard", async () => {
    vi.useFakeTimers({ now: placedAt });
    const { repos, jobQueue, order, onDelivered, rush } = await setup({ autoProcess: true });
    await jobQueue.scheduleOrderLadder(order.id); // as checkout does
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    await rush();

    const stateAt = async (msAfterPlaced: number) => {
      await vi.advanceTimersByTimeAsync(msAfterPlaced - (Date.now() - placedAt.getTime()));
      return (await repos.findOrderById(order.id))!.state;
    };
    expect(await stateAt(25 * MINUTE - 1)).toBe("PROCESSING");
    expect(await stateAt(25 * MINUTE)).toBe("PACKED"); // Standard: 3h
    expect(await stateAt(85 * MINUTE)).toBe("OUT_FOR_DELIVERY");
    expect(await stateAt(115 * MINUTE)).toBe("ARRIVING_SOON");
    expect(await stateAt(120 * MINUTE - 1)).toBe("ARRIVING_SOON");
    expect(await stateAt(120 * MINUTE)).toBe("DELIVERED"); // Standard: 12h
    // The Standard timers still fire, but find the order already moved on.
    expect(await stateAt(13 * HOUR)).toBe("DELIVERED");
    expect(onDelivered).toHaveBeenCalledOnce();
  });

  it("refuses a second rush without charging again", async () => {
    const { rush, rushSpends } = await setup();
    await rush();

    await expect(rush()).rejects.toMatchObject({ code: "ALREADY_EXPRESS" });
    expect(await rushSpends()).toHaveLength(1);
  });

  it("charges once when two rushes race", async () => {
    const { repos, user, rush, rushSpends } = await setup();

    const results = await Promise.allSettled([rush(), rush()]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ code: "ALREADY_EXPRESS" });
    expect(await rushSpends()).toHaveLength(1);
    expect(await repos.getCoinBalance(user.id)).toBe(500 - RUSH_TO_EXPRESS_COST_COINS);
  });

  it("plans again when a delivery step lands mid-rush", async () => {
    const { repos, jobQueue, order, rush, rushSpends } = await setup();
    // The order is packed between the service reading it and the atomic write.
    const racing: Repositories = {
      ...repos,
      async rushOrderToExpress(input) {
        await repos.updateOrderState(order.id, "PACKED", undefined, { from: "PROCESSING" });
        return repos.rushOrderToExpress(input);
      },
    };

    const result = await rush({ repos: racing, jobQueue });

    expect(result.order).toMatchObject({ state: "PACKED", tier: "EXPRESS" });
    // Planned from PACKED, so the packed time stays as it was.
    expect(result.order.stateEta.PACKED).toBe(order.stateEta.PACKED);
    expect(await rushSpends()).toHaveLength(1);
  });

  it("refuses with INSUFFICIENT_COINS and changes nothing when coins are short", async () => {
    const { repos, jobQueue, user, order, rush, rushSpends } = await setup({
      balance: RUSH_TO_EXPRESS_COST_COINS - 1,
    });
    const schedule = vi.spyOn(jobQueue, "scheduleOrderLadder");

    await expect(rush()).rejects.toMatchObject({ code: "INSUFFICIENT_COINS" });

    expect(await repos.findOrderById(order.id)).toEqual(order);
    expect(await repos.getCoinBalance(user.id)).toBe(RUSH_TO_EXPRESS_COST_COINS - 1);
    expect(await rushSpends()).toEqual([]);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("treats another user's order as not found", async () => {
    const { repos, jobQueue, order } = await setup();
    const { user: other } = await repos.createUser("919999999999");
    await repos.grantCoins({ userId: other.id, delta: 500, type: "GRANT" });

    const attempt = rushOrderToExpress({ repos, jobQueue }, { userId: other.id, orderId: order.id });

    await expect(attempt).rejects.toBeInstanceOf(RushError);
    await expect(attempt).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await repos.getCoinBalance(other.id)).toBe(500);
    expect((await repos.findOrderById(order.id))!.tier).toBe("STANDARD");
  });
});
