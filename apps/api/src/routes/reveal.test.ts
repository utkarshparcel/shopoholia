import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { REVEAL_UNLOCK_COST_COINS, type UnlockResponse } from "@worn/shared";
import { buildStateEta } from "../lib/orders/state-machine.js";
import type { Repositories } from "../lib/repositories/types.js";
import { buildTestServer, login } from "../test-utils.js";

type App = Awaited<ReturnType<typeof buildTestServer>>["app"];

/** A delivered order with `itemCount` lines, each with one locked paid render and one free render. */
async function deliveredOrder(repos: Repositories, userId: string, itemCount = 1) {
  const { order, items } = await repos.createOrder({
    userId,
    tier: "EXPRESS",
    coinTotal: 0,
    stateEta: buildStateEta(new Date(), "EXPRESS"),
    items: Array.from({ length: itemCount }, () => ({
      listingVariantId: randomUUID(),
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
