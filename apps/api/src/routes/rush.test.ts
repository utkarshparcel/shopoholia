import {
  ONBOARDING_COIN_GRANT,
  ORDER_DELIVERY_LADDER,
  RUSH_TO_EXPRESS_COST_COINS,
} from "@worn/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";
import { createAvatarProcessingHandler } from "../lib/jobs/avatar-processing.js";
import { createOrderTransitionHandler } from "../lib/jobs/order-processing.js";
import { createMemoryJobQueue } from "../lib/jobs/queue.js";
import {
  createDeliveredRenderHandler,
  createRenderProcessingHandler,
} from "../lib/jobs/render-processing.js";
import { createTryonProcessingHandler } from "../lib/jobs/tryon-processing.js";
import { createDevOtpService } from "../lib/auth/otp.js";
import { buildStateEta } from "../lib/orders/state-machine.js";
import { createStubPushService } from "../lib/push/stub.js";
import { createMockRenderProvider } from "../lib/render/provider.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { seedCatalog } from "../lib/seed/catalog.js";
import { createMockStorage } from "../lib/storage/r2.js";

type App = Awaited<ReturnType<typeof buildServer>>;

async function buildTestDeps() {
  const repos = createMemoryRepositories();
  const storage = createMockStorage();
  const renderProvider = createMockRenderProvider();
  const push = createStubPushService(repos);
  const jobQueue = createMemoryJobQueue(
    {
      avatar: createAvatarProcessingHandler({ repos, storage, renderProvider }),
      tryon: createTryonProcessingHandler({ repos, storage, renderProvider }),
      orderTransition: createOrderTransitionHandler({
        repos,
        push,
        onDelivered: async (orderId) => {
          await jobQueue.enqueueDeliveredRender({ orderId });
        },
      }),
      deliveredRender: createDeliveredRenderHandler({
        repos,
        enqueueRender: async (job) => jobQueue.enqueueRender(job),
      }),
      render: createRenderProcessingHandler({ repos, storage, renderProvider, push }),
    },
    { autoProcess: false, repos },
  );
  await seedCatalog(repos, storage, 3, { preferScraped: false });
  return { repos, storage, renderProvider, jobQueue, otp: createDevOtpService(repos), push };
}

async function login(app: App, phone: string) {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function placeOrder(app: App, token: string, tier: string) {
  const feed = await app.inject({ method: "GET", url: "/feed?limit=1" });
  const detail = await app.inject({ method: "GET", url: `/listings/${feed.json().items[0].id}` });
  await app.inject({
    method: "POST",
    url: "/cart",
    headers: auth(token),
    payload: { variantId: detail.json().variants[0].id, quantity: 1 },
  });
  const created = await app.inject({
    method: "POST",
    url: "/orders",
    headers: auth(token),
    payload: { tier },
  });
  expect(created.statusCode).toBe(201);
  return created.json() as { id: string; placedAt: string; stateEta: Record<string, string> };
}

describe("POST /orders/:id/rush", () => {
  let app: App;
  let token: string;

  const rush = (orderId: string, headers = auth(token)) =>
    app.inject({ method: "POST", url: `/orders/${orderId}/rush`, headers });
  const getOrder = async (orderId: string) =>
    (await app.inject({ method: "GET", url: `/orders/${orderId}`, headers: auth(token) })).json();
  const balance = async () =>
    (await app.inject({ method: "GET", url: "/coins/balance", headers: auth(token) })).json()
      .balance as number;
  const rushSpends = async (orderId: string) => {
    const { userId } = (await app.deps.repos.findOrderById(orderId))!;
    const { transactions } = await app.deps.repos.listCoinTransactions({ userId, limit: 50 });
    return transactions.filter((tx) => tx.type === "SPEND_RUSH");
  };

  beforeEach(async () => {
    // Prod timings, where Express is faster than the other tiers.
    vi.stubEnv("WORN_ECONOMY_MODE", "prod");
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    token = await login(app, "919876543210");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it("offers the rush on in-transit orders that Express would speed up", async () => {
    const order = await placeOrder(app, token, "STANDARD");

    expect(order).toMatchObject({ rushAvailable: true, rushCostCoins: RUSH_TO_EXPRESS_COST_COINS });
    expect(await getOrder(order.id)).toMatchObject({ rushAvailable: true });
    const list = await app.inject({ method: "GET", url: "/orders", headers: auth(token) });
    expect(list.json().orders[0]).toMatchObject({
      rushAvailable: true,
      rushCostCoins: RUSH_TO_EXPRESS_COST_COINS,
    });
  });

  it("moves the remaining steps onto Express times and charges once", async () => {
    const order = await placeOrder(app, token, "STANDARD");
    const before = await balance();

    const res = await rush(order.id);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balanceAfter).toBe(before - RUSH_TO_EXPRESS_COST_COINS);
    expect(body.order).toMatchObject({ id: order.id, tier: "EXPRESS", rushAvailable: false });
    const express = buildStateEta(new Date(order.placedAt), "EXPRESS");
    for (const step of ORDER_DELIVERY_LADDER) {
      expect(body.order.stateEta[step]).toBe(express[step]);
      expect(Date.parse(body.order.stateEta[step])).toBeLessThan(Date.parse(order.stateEta[step]!));
    }
    expect(body.order.stateEta.PROCESSING).toBe(order.stateEta.PROCESSING);

    expect(await getOrder(order.id)).toEqual(body.order);
    expect(await balance()).toBe(body.balanceAfter);
    expect(await rushSpends(order.id)).toMatchObject([
      { delta: -RUSH_TO_EXPRESS_COST_COINS, refType: "order", refId: order.id },
    ]);
  });

  it("re-arms the delivery steps at their new times", async () => {
    const order = await placeOrder(app, token, "STANDARD");
    const schedule = vi.spyOn(app.deps.jobQueue, "scheduleOrderLadder");

    await rush(order.id);

    expect(schedule).toHaveBeenCalledExactlyOnceWith(order.id);
  });

  it("refuses a retry without charging again", async () => {
    const order = await placeOrder(app, token, "STANDARD");
    await rush(order.id);
    const afterFirst = await balance();

    const retry = await rush(order.id);

    expect(retry.statusCode).toBe(409);
    expect(retry.json()).toMatchObject({ error: "ALREADY_EXPRESS" });
    expect(await balance()).toBe(afterFirst);
    expect(await rushSpends(order.id)).toHaveLength(1);
  });

  it("charges once when the rush is sent twice at once", async () => {
    const order = await placeOrder(app, token, "STANDARD");
    const before = await balance();

    const [a, b] = await Promise.all([rush(order.id), rush(order.id)]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await balance()).toBe(before - RUSH_TO_EXPRESS_COST_COINS);
    expect(await rushSpends(order.id)).toHaveLength(1);
  });

  it("returns 402 and changes nothing when coins are short", async () => {
    const order = await placeOrder(app, token, "STANDARD");
    const { userId } = (await app.deps.repos.findOrderById(order.id))!;
    const left = RUSH_TO_EXPRESS_COST_COINS - 1;
    await app.deps.repos.spendCoins({ userId, delta: (await balance()) - left, type: "SPEND_ORDER" });

    const res = await rush(order.id);

    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ error: "INSUFFICIENT_COINS" });
    expect(await getOrder(order.id)).toMatchObject({
      tier: "STANDARD",
      stateEta: order.stateEta,
      rushAvailable: true,
    });
    expect(await balance()).toBe(left);
    expect(await rushSpends(order.id)).toEqual([]);
  });

  it("returns 409 for an order placed on Express", async () => {
    const order = await placeOrder(app, token, "EXPRESS");
    const before = await balance();

    const res = await rush(order.id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "ALREADY_EXPRESS" });
    expect((await getOrder(order.id)).rushAvailable).toBe(false);
    expect(await balance()).toBe(before);
  });

  it("returns 409 once the order is delivered", async () => {
    const order = await placeOrder(app, token, "SLOW_BURN");
    await app.deps.repos.updateOrderState(order.id, "DELIVERED");
    const before = await balance();

    const res = await rush(order.id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "NOT_IN_TRANSIT" });
    expect(await getOrder(order.id)).toMatchObject({ tier: "SLOW_BURN", rushAvailable: false });
    expect(await balance()).toBe(before);
  });

  it("returns 409 when Express wouldn't be any sooner", async () => {
    // Beta timings are the same for every tier.
    vi.stubEnv("WORN_ECONOMY_MODE", "beta");
    const order = await placeOrder(app, token, "STANDARD");
    expect(order).toMatchObject({ rushAvailable: false });
    const before = await balance();

    const res = await rush(order.id);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "NO_SPEEDUP" });
    expect(await getOrder(order.id)).toMatchObject({ tier: "STANDARD", stateEta: order.stateEta });
    expect(await balance()).toBe(before);
  });

  it("returns 404 for another user's order or an unknown one", async () => {
    const order = await placeOrder(app, token, "STANDARD");
    const ownerBalance = await balance();
    const otherToken = await login(app, "919000000001");

    const res = await rush(order.id, auth(otherToken));
    const unknown = await rush("00000000-0000-4000-8000-000000000000");

    expect(res.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(await getOrder(order.id)).toMatchObject({ tier: "STANDARD", stateEta: order.stateEta });
    expect(await balance()).toBe(ownerBalance);
    expect(await rushSpends(order.id)).toEqual([]);
    const others = await app.inject({ method: "GET", url: "/coins/balance", headers: auth(otherToken) });
    expect(others.json().balance).toBe(ONBOARDING_COIN_GRANT);
  });

  it("requires auth", async () => {
    const order = await placeOrder(app, token, "STANDARD");
    const res = await app.inject({ method: "POST", url: `/orders/${order.id}/rush` });
    expect(res.statusCode).toBe(401);
  });
});
