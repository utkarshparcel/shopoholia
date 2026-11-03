import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  REVEAL_COMBINE_COST_COINS,
  REVEAL_COMBINE_MAX_ITEMS,
  REVEAL_GENERATE_COST_COINS,
  REVEAL_UNLOCK_COST_COINS,
  type GenerateRenderResponse,
  type UnlockResponse,
} from "@worn/shared";
import { buildStateEta } from "../lib/orders/state-machine.js";
import { createUnavailableRenderProvider } from "../lib/render/provider.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import type { Repositories } from "../lib/repositories/types.js";
import { buildServer } from "../index.js";
import { buildTestServer, login } from "../test-utils.js";

type App = Awaited<ReturnType<typeof buildTestServer>>["app"];

/** A delivered order with `itemCount` lines, each with one locked paid render and one free render. */
async function deliveredOrder(repos: Repositories, userId: string, itemCount = 1) {
  // Real catalog lines, so a render of them has garments to dress.
  const listingId = randomUUID();
  const variantIds = Array.from({ length: itemCount }, () => randomUUID());
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Reveal test",
        category: "TOPS",
        tags: [],
        coinPrice: 100,
        realPrice: null,
        productImageKeys: [],
        houseModelRenderKey: `house-models/${listingId}.jpg`,
        affiliateUrl: null,
        affiliateLinks: null,
        status: "DRAFT",
        sortOrder: 0,
        createdAt: new Date(),
      },
    ],
    variantIds.map((id) => ({ id, listingId, size: "M", color: "Black", garmentImageKey: `garments/${id}.jpg` })),
  );
  const { order, items } = await repos.createOrder({
    userId,
    tier: "EXPRESS",
    coinTotal: 0,
    stateEta: buildStateEta(new Date(), "EXPRESS"),
    items: variantIds.map((listingVariantId) => ({
      listingVariantId,
      coinPriceSnapshot: 100,
      quantity: 1,
    })),
  });
  await repos.updateOrderState(order.id, "DELIVERED");
  const renders = await repos.createRenders(
    items.flatMap((item) => [
      {
        orderItemId: item.id,
        scenario: "STUDIO" as const,
        imageKey: `reveal/${item.id}/free.jpg`,
        isFree: true,
        unlocked: true,
        provider: "mock",
        status: "DONE" as const,
        costMicros: 0,
      },
      {
        orderItemId: item.id,
        scenario: "STREET" as const,
        imageKey: `reveal/${item.id}/paid.jpg`,
        isFree: false,
        unlocked: false,
        provider: "mock",
        status: "DONE" as const,
        costMicros: 0,
      },
    ]),
  );
  return {
    order,
    items,
    free: renders.filter((r) => r.isFree),
    locked: renders.filter((r) => !r.isFree),
  };
}

function unlock(app: App, accessToken: string, orderId: string, payload: object) {
  return app.inject({
    method: "POST",
    url: `/orders/${orderId}/reveal/unlock`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload,
  });
}

function generate(app: App, accessToken: string, orderId: string, orderItemIds: string[], idempotencyKey?: string) {
  return app.inject({
    method: "POST",
    url: `/orders/${orderId}/reveal/generate`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { orderItemIds, scenario: "STUDIO", idempotencyKey },
  });
}

/** Gives balance reads some latency, as a database has, so parallel requests overlap. */
function slowBalanceReads(repos: Repositories) {
  const read = repos.getCoinBalance.bind(repos);
  repos.getCoinBalance = async (userId) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return read(userId);
  };
}

async function setup() {
  const { app, repos } = await buildTestServer();
  const alice = await login(app, "919800000001");
  const bob = await login(app, "919800000002");
  await repos.grantCoins({ userId: alice.userId, delta: 1000, type: "GRANT" });
  await repos.grantCoins({ userId: bob.userId, delta: 1000, type: "GRANT" });
  return { app, repos, alice, bob };
}

describe("reveal unlock", () => {
  it("a replayed key returns only the order's own renders", async () => {
    const { app, repos, alice, bob } = await setup();
    const aliceOrder = await deliveredOrder(repos, alice.userId);
    const bobOrder = await deliveredOrder(repos, bob.userId);
    // Alice has paid to see her render.
    expect(
      (await unlock(app, alice.accessToken, aliceOrder.order.id, { renderIds: [aliceOrder.locked[0]!.id] }))
        .statusCode,
    ).toBe(200);

    const key = randomUUID();
    const first = await unlock(app, bob.accessToken, bobOrder.order.id, {
      renderIds: [bobOrder.locked[0]!.id],
      idempotencyKey: key,
    });
    expect(first.statusCode).toBe(200);

    const aliceIds = [...aliceOrder.free, ...aliceOrder.locked].map((r) => r.id);
    const replay = await unlock(app, bob.accessToken, bobOrder.order.id, {
      renderIds: aliceIds,
      idempotencyKey: key,
    });
    expect(replay.statusCode).toBe(200);
    const body = replay.json() as UnlockResponse;
    expect(body.renders.filter((r) => aliceIds.includes(r.id))).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(aliceOrder.items[0]!.id);
    expect(body.coinsSpent).toBe(REVEAL_UNLOCK_COST_COINS);
    await app.close();
  });

  it("the same key on another order unlocks that order instead of replaying", async () => {
    const { app, repos, bob } = await setup();
    const x = await deliveredOrder(repos, bob.userId);
    const y = await deliveredOrder(repos, bob.userId);
    const key = randomUUID();
    const before = await repos.getCoinBalance(bob.userId);

    expect((await unlock(app, bob.accessToken, x.order.id, { renderIds: [x.locked[0]!.id], idempotencyKey: key })).statusCode).toBe(200);
    const onY = await unlock(app, bob.accessToken, y.order.id, { renderIds: [y.locked[0]!.id], idempotencyKey: key });
    expect(onY.statusCode).toBe(200);
    expect((onY.json() as UnlockResponse).renders.map((r) => [r.id, r.unlocked])).toEqual([[y.locked[0]!.id, true]]);
    expect((await repos.findRenderById(y.locked[0]!.id))?.unlocked).toBe(true);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - 2 * REVEAL_UNLOCK_COST_COINS);
    await app.close();
  });

  it("a retried key charges once", async () => {
    const { app, repos, bob } = await setup();
    slowBalanceReads(repos);
    const { order, locked } = await deliveredOrder(repos, bob.userId);
    const before = await repos.getCoinBalance(bob.userId);
    const key = randomUUID();
    const results = await Promise.all(
      [1, 2, 3].map(() => unlock(app, bob.accessToken, order.id, { renderIds: [locked[0]!.id], idempotencyKey: key })),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(results.map((r) => (r.json() as UnlockResponse).coinsSpent)).toEqual([50, 50, 50]);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - REVEAL_UNLOCK_COST_COINS);
    await app.close();
  });

  it("parallel unlocks of one render charge once", async () => {
    const { app, repos, bob } = await setup();
    slowBalanceReads(repos);
    const { order, locked } = await deliveredOrder(repos, bob.userId);
    const before = await repos.getCoinBalance(bob.userId);

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => unlock(app, bob.accessToken, order.id, { renderIds: [locked[0]!.id] })),
    );

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404, 404, 404]);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - REVEAL_UNLOCK_COST_COINS);
    await app.close();
  });

  it("charges only for the order's locked renders and refuses when short", async () => {
    const { app, repos, alice, bob } = await setup();
    const aliceOrder = await deliveredOrder(repos, alice.userId);
    const { order, free, locked } = await deliveredOrder(repos, bob.userId, 2);

    const res = await unlock(app, bob.accessToken, order.id, {
      renderIds: [locked[0]!.id, locked[0]!.id, free[0]!.id, aliceOrder.locked[0]!.id],
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as UnlockResponse).coinsSpent).toBe(REVEAL_UNLOCK_COST_COINS);
    expect((await repos.findRenderById(aliceOrder.locked[0]!.id))?.unlocked).toBe(false);

    await repos.spendCoins({ userId: bob.userId, delta: await repos.getCoinBalance(bob.userId), type: "SPEND_UNLOCK" });
    const short = await unlock(app, bob.accessToken, order.id, { renderIds: [locked[1]!.id] });
    expect(short.statusCode).toBe(402);
    expect((await repos.findRenderById(locked[1]!.id))?.unlocked).toBe(false);
    await app.close();
  });
});

describe("reveal generate", () => {
  it("one item makes one render at the single-item price", async () => {
    const { app, repos, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId);
    const before = await repos.getCoinBalance(bob.userId);
    const res = await generate(app, bob.accessToken, order.id, [items[0]!.id]);
    expect(res.statusCode).toBe(200);
    const body = res.json() as GenerateRenderResponse;
    expect(body).toMatchObject({ coinsSpent: REVEAL_GENERATE_COST_COINS, isCombine: false });
    expect(body.renders).toHaveLength(1);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - REVEAL_GENERATE_COST_COINS);
    await app.close();
  });

  it("a combine makes one combined render", async () => {
    const { app, repos, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId, 3);
    const before = await repos.getCoinBalance(bob.userId);
    const res = await generate(app, bob.accessToken, order.id, items.map((i) => i.id));
    expect(res.statusCode).toBe(200);
    const body = res.json() as GenerateRenderResponse;
    expect(body).toMatchObject({ coinsSpent: REVEAL_COMBINE_COST_COINS, isCombine: true });
    expect(body.renders).toHaveLength(1);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - REVEAL_COMBINE_COST_COINS);
    await app.deps.jobQueue.flushRenderJobs!();
    // Done, and it still knows its items: the provider name no longer overwrites them.
    expect(await repos.findRenderById(body.renders[0]!.id)).toMatchObject({
      status: "DONE",
      provider: app.deps.renderProvider.name,
      combinedItemIds: items.map((i) => i.id),
    });
    await app.close();
  });

  it("duplicate ids count once", async () => {
    const { app, repos, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId, 2);
    const before = await repos.getCoinBalance(bob.userId);
    const id = items[0]!.id;

    const single = await generate(app, bob.accessToken, order.id, [id, id, id]);
    expect(single.statusCode).toBe(200);
    expect(single.json()).toMatchObject({ coinsSpent: REVEAL_GENERATE_COST_COINS, isCombine: false });
    expect((single.json() as GenerateRenderResponse).renders).toHaveLength(1);

    const pair = await generate(app, bob.accessToken, order.id, [id, items[1]!.id, id]);
    expect(pair.statusCode).toBe(200);
    expect((pair.json() as GenerateRenderResponse).renders).toHaveLength(1);
    expect(await repos.getCoinBalance(bob.userId)).toBe(
      before - REVEAL_GENERATE_COST_COINS - REVEAL_COMBINE_COST_COINS,
    );
    await app.close();
  });

  it("refuses more items than a combine takes, and items from another order", async () => {
    const { app, repos, alice, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId, REVEAL_COMBINE_MAX_ITEMS + 1);
    const aliceOrder = await deliveredOrder(repos, alice.userId);
    const before = await repos.getCoinBalance(bob.userId);
    const rendersBefore = (await repos.findRendersByOrderId(order.id)).length;

    const tooMany = await generate(app, bob.accessToken, order.id, items.map((i) => i.id));
    expect(tooMany.statusCode).toBe(400);
    const thirty = await generate(app, bob.accessToken, order.id, Array(30).fill(items[0]!.id));
    expect(thirty.statusCode).toBe(400);
    const foreign = await generate(app, bob.accessToken, order.id, [items[0]!.id, aliceOrder.items[0]!.id]);
    expect(foreign.statusCode).toBe(400);

    expect(await repos.getCoinBalance(bob.userId)).toBe(before);
    expect(await repos.findRendersByOrderId(order.id)).toHaveLength(rendersBefore);
    expect(await repos.findRendersByOrderId(aliceOrder.order.id)).toHaveLength(2);
    await app.close();
  });
});

describe("reveal generate ledger", () => {
  it("records a generate as SPEND_RENDER and a combine as SPEND_COMBINE, and lists them", async () => {
    const { app, repos, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId, 2);
    expect((await generate(app, bob.accessToken, order.id, [items[0]!.id])).statusCode).toBe(200);
    expect((await generate(app, bob.accessToken, order.id, items.map((i) => i.id))).statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: "/coins/transactions",
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { transactions } = res.json() as { transactions: Array<{ type: string; delta: number }> };
    // Same-millisecond entries can list in either order on memory.
    expect(transactions.filter((t) => t.type !== "GRANT").map((t) => [t.type, t.delta]).sort()).toEqual([
      ["SPEND_COMBINE", -REVEAL_COMBINE_COST_COINS],
      ["SPEND_RENDER", -REVEAL_GENERATE_COST_COINS],
    ]);
    await app.close();
  });
});

describe("reveal generate idempotency", () => {
  it("a retried key returns the first render and charges once", async () => {
    const { app, repos, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId);
    const before = await repos.getCoinBalance(bob.userId);
    const rendersBefore = (await repos.findRendersByOrderId(order.id)).length;
    const key = randomUUID();

    const first = await generate(app, bob.accessToken, order.id, [items[0]!.id], key);
    const retry = await generate(app, bob.accessToken, order.id, [items[0]!.id], key);

    expect([first.statusCode, retry.statusCode]).toEqual([200, 200]);
    const a = first.json() as GenerateRenderResponse;
    const b = retry.json() as GenerateRenderResponse;
    expect(b).toMatchObject({ coinsSpent: REVEAL_GENERATE_COST_COINS, isCombine: false });
    expect(b.renders.map((r) => r.id)).toEqual(a.renders.map((r) => r.id));
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - REVEAL_GENERATE_COST_COINS);
    expect(await repos.findRendersByOrderId(order.id)).toHaveLength(rendersBefore + 1);
    await app.close();
  });

  it("parallel combines with one key charge once and make one render", async () => {
    const { app, repos, bob } = await setup();
    slowBalanceReads(repos);
    const { order, items } = await deliveredOrder(repos, bob.userId, 2);
    const before = await repos.getCoinBalance(bob.userId);
    const rendersBefore = (await repos.findRendersByOrderId(order.id)).length;
    const key = randomUUID();

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => generate(app, bob.accessToken, order.id, items.map((i) => i.id), key)),
    );

    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
    const bodies = results.map((r) => r.json() as GenerateRenderResponse);
    expect(bodies.map((body) => [body.coinsSpent, body.isCombine])).toEqual(
      Array(4).fill([REVEAL_COMBINE_COST_COINS, true]),
    );
    expect(new Set(bodies.map((body) => body.renders[0]!.id)).size).toBe(1);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - REVEAL_COMBINE_COST_COINS);
    expect(await repos.findRendersByOrderId(order.id)).toHaveLength(rendersBefore + 1);
    await app.close();
  });

  it("a replay is not refused when the balance has since run out", async () => {
    const { app, repos, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId);
    const key = randomUUID();
    expect((await generate(app, bob.accessToken, order.id, [items[0]!.id], key)).statusCode).toBe(200);
    await repos.spendCoins({ userId: bob.userId, delta: await repos.getCoinBalance(bob.userId), type: "SPEND_UNLOCK" });

    const replay = await generate(app, bob.accessToken, order.id, [items[0]!.id], key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ coinsSpent: REVEAL_GENERATE_COST_COINS });
    expect((await generate(app, bob.accessToken, order.id, [items[0]!.id], randomUUID())).statusCode).toBe(402);
    await app.close();
  });

  it("the same key on another order makes a new render there", async () => {
    const { app, repos, bob } = await setup();
    const x = await deliveredOrder(repos, bob.userId);
    const y = await deliveredOrder(repos, bob.userId);
    const before = await repos.getCoinBalance(bob.userId);
    const key = randomUUID();

    const onX = await generate(app, bob.accessToken, x.order.id, [x.items[0]!.id], key);
    const onY = await generate(app, bob.accessToken, y.order.id, [y.items[0]!.id], key);

    expect([onX.statusCode, onY.statusCode]).toEqual([200, 200]);
    const yRender = (onY.json() as GenerateRenderResponse).renders[0]!;
    expect(yRender.orderItemId).toBe(y.items[0]!.id);
    expect(yRender.id).not.toBe((onX.json() as GenerateRenderResponse).renders[0]!.id);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - 2 * REVEAL_GENERATE_COST_COINS);
    await app.close();
  });

  it("without a key, each request is a new render", async () => {
    const { app, repos, bob } = await setup();
    const { order, items } = await deliveredOrder(repos, bob.userId);
    const before = await repos.getCoinBalance(bob.userId);
    await generate(app, bob.accessToken, order.id, [items[0]!.id]);
    await generate(app, bob.accessToken, order.id, [items[0]!.id]);
    expect(await repos.getCoinBalance(bob.userId)).toBe(before - 2 * REVEAL_GENERATE_COST_COINS);
    await app.close();
  });
});

describe("reveal renders run in the background", () => {
  it("generate and unlock answer with QUEUED cards and leave other renders alone", async () => {
    const { app, repos, alice, bob } = await setup();
    const aliceOrder = await deliveredOrder(repos, alice.userId);
    const [alicePending] = await repos.createRenders([
      { ...aliceOrder.free[0]!, id: undefined, scenario: "GOLDEN_HOUR", imageKey: null, status: "QUEUED" },
    ]);
    await app.deps.jobQueue.enqueueRender({ renderId: alicePending!.id, orderId: aliceOrder.order.id });
    const { order, items, locked } = await deliveredOrder(repos, bob.userId);
    await repos.updateRender(locked[0]!.id, { status: "QUEUED", imageKey: null });

    const generated = await generate(app, bob.accessToken, order.id, [items[0]!.id]);
    const unlocked = await unlock(app, bob.accessToken, order.id, { renderIds: [locked[0]!.id] });

    expect((generated.json() as GenerateRenderResponse).renders.map((r) => r.status)).toEqual(["QUEUED"]);
    expect((unlocked.json() as UnlockResponse).renders.map((r) => [r.status, r.imageUrl])).toEqual([["QUEUED", null]]);
    // Nothing rendered inside the requests, and Alice's queued render was not run by Bob's.
    expect((await repos.findRenderById(alicePending!.id))?.status).toBe("QUEUED");

    await app.deps.jobQueue.flushRenderJobs!();
    const generatedId = (generated.json() as GenerateRenderResponse).renders[0]!.id;
    expect((await repos.findRendersByIds([generatedId, locked[0]!.id, alicePending!.id])).map((r) => r.status)).toEqual([
      "DONE",
      "DONE",
      "DONE",
    ]);
    await app.close();
  });

  it("answers 503 without charging when renders can't run", async () => {
    const repos = createMemoryRepositories();
    const app = await buildServer({
      logger: false,
      deps: { repos, renderProvider: createUnavailableRenderProvider() },
    });
    const bob = await login(app, "919800000002");
    await repos.grantCoins({ userId: bob.userId, delta: 1000, type: "GRANT" });
    const { order, items, locked } = await deliveredOrder(repos, bob.userId);
    const rendersBefore = (await repos.findRendersByOrderId(order.id)).length;
    const before = await repos.getCoinBalance(bob.userId);

    const generated = await generate(app, bob.accessToken, order.id, [items[0]!.id]);
    const unlocked = await unlock(app, bob.accessToken, order.id, { renderIds: [locked[0]!.id] });

    expect([generated.statusCode, unlocked.statusCode]).toEqual([503, 503]);
    expect(generated.json()).toMatchObject({ error: "tryon_unavailable" });
    expect(await repos.getCoinBalance(bob.userId)).toBe(before);
    expect(await repos.findRendersByOrderId(order.id)).toHaveLength(rendersBefore);
    expect((await repos.findRenderById(locked[0]!.id))?.unlocked).toBe(false);
    await app.close();
  });

  it("retries a failed free render, and only the order owner's failed free ones", async () => {
    const { app, repos, alice, bob } = await setup();
    const { order, free, locked } = await deliveredOrder(repos, bob.userId);
    await repos.updateRender(free[0]!.id, { status: "FAILED", imageKey: null });
    await repos.updateRender(locked[0]!.id, { status: "FAILED", unlocked: true, imageKey: null });
    const retry = (token: string, renderIds: string[]) =>
      app.inject({
        method: "POST",
        url: `/orders/${order.id}/reveal/retry`,
        headers: { authorization: `Bearer ${token}` },
        payload: { renderIds },
      });

    expect((await retry(alice.accessToken, [free[0]!.id])).statusCode).toBe(404);
    expect((await retry(bob.accessToken, [locked[0]!.id])).statusCode).toBe(404);
    const res = await retry(bob.accessToken, [free[0]!.id, locked[0]!.id]);
    expect(res.statusCode).toBe(200);
    expect(res.json().renders.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([
      [free[0]!.id, "QUEUED"],
    ]);

    await app.deps.jobQueue.flushRenderJobs!();
    expect((await repos.findRenderById(free[0]!.id))?.status).toBe("DONE");
    expect((await repos.findRenderById(locked[0]!.id))?.status).toBe("FAILED");
    await app.close();
  });
});

describe("reveal rating", () => {
  function rate(app: App, accessToken: string, orderId: string, rating: string) {
    return app.inject({
      method: "POST",
      url: `/orders/${orderId}/reveal/rating`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { rating },
    });
  }

  it("keeps the rating out of stateEta, so the orders list and detail still serialise", async () => {
    const { app, repos, alice } = await setup();
    const { order } = await deliveredOrder(repos, alice.userId);

    const res = await rate(app, alice.accessToken, order.id, "loved");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ orderId: order.id, rating: "loved", recorded: true });

    const stored = await repos.findOrderById(order.id);
    expect(stored?.revealRating).toBe("loved");
    expect(stored?.stateEta).not.toHaveProperty("rating");

    const headers = { authorization: `Bearer ${alice.accessToken}` };
    const list = await app.inject({ method: "GET", url: "/orders", headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().orders[0].stateEta).not.toHaveProperty("rating");
    const detail = await app.inject({ method: "GET", url: `/orders/${order.id}`, headers });
    expect(detail.statusCode).toBe(200);

    const again = await rate(app, alice.accessToken, order.id, "meh");
    expect(again.statusCode).toBe(200);
    expect((await repos.findOrderById(order.id))?.revealRating).toBe("meh");
    await app.close();
  });

  it("refuses an order whose reveal isn't open yet, and other people's orders", async () => {
    const { app, repos, alice, bob } = await setup();
    const { order: pending } = await repos.createOrder({
      userId: alice.userId,
      tier: "STANDARD",
      coinTotal: 0,
      stateEta: buildStateEta(new Date(), "STANDARD"),
      items: [{ listingVariantId: randomUUID(), coinPriceSnapshot: 100, quantity: 1 }],
    });
    const early = await rate(app, alice.accessToken, pending.id, "ok");
    expect(early.statusCode).toBe(409);
    expect((await repos.findOrderById(pending.id))?.revealRating).toBeNull();

    const { order: bobs } = await deliveredOrder(repos, bob.userId);
    const foreign = await rate(app, alice.accessToken, bobs.id, "meh");
    expect(foreign.statusCode).toBe(404);
    expect((await repos.findOrderById(bobs.id))?.revealRating).toBeNull();
    await app.close();
  });
});
