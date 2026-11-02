import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { PurchaseRenderInput, Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// Paying for a generated or combined reveal render. The same cases run on memory (always) and
// Postgres (with DATABASE_URL).
describe("memory purchaseRender", () => {
  const repos = createMemoryRepositories();
  purchaseRenderCases(() => repos);
});

describePostgres("Postgres purchaseRender", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  purchaseRenderCases(() => repos);
});

async function seedVariant(repos: Repositories) {
  const listingId = randomUUID();
  const variantId = randomUUID();
  await repos.seedListings(
    [
      {
        id: listingId,
        title: "Reveal purchase test",
        brand: "Test",
        category: "TOPS",
        tags: [],
        coinPrice: 60,
        realPrice: null,
        productImageKeys: [],
        houseModelRenderKey: "",
        affiliateUrl: null,
        affiliateLinks: null,
        // Kept out of the feed so these rows can't be mistaken for the real catalog.
        status: "DRAFT",
        sortOrder: 0,
        createdAt: new Date(),
      },
    ],
    [{ id: variantId, listingId, size: "M", color: "Black", garmentImageKey: "g.jpg" }],
  );
  return variantId;
}

/** A user with `balance` coins and an order of `itemCount` lines. */
async function setup(repos: Repositories, balance = 500, itemCount = 2) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  await repos.grantCoins({ userId: user.id, delta: balance, type: "GRANT" });
  const variantId = await seedVariant(repos);
  const { order, items } = await repos.createOrder({
    userId: user.id,
    tier: "STANDARD",
    coinTotal: 0,
    stateEta: { PROCESSING: new Date().toISOString() },
    items: Array.from({ length: itemCount }, () => ({
      listingVariantId: variantId,
      coinPriceSnapshot: 60,
      quantity: 1,
    })),
  });
  return { user, order, items };
}

function purchase(
  userId: string,
  orderId: string,
  orderItemId: string,
  patch: Partial<PurchaseRenderInput> = {},
): PurchaseRenderInput {
  return {
    userId,
    orderId,
    render: {
      orderItemId,
      scenario: "STUDIO",
      imageKey: null,
      isFree: false,
      unlocked: true,
      provider: "user-generated",
      status: "QUEUED",
      costMicros: 0,
    },
    cost: 50,
    ledgerType: "SPEND_RENDER",
    ...patch,
  };
}

function purchaseRenderCases(getRepos: () => Repositories) {
  it("debits and creates the render together", async () => {
    const repos = getRepos();
    const { user, order, items } = await setup(repos);

    const result = await repos.purchaseRender(purchase(user.id, order.id, items[0]!.id));

    expect(result).toMatchObject({ status: "created", coinsSpent: 50, balanceAfter: 450 });
    expect(await repos.getCoinBalance(user.id)).toBe(450);
    expect((await repos.findRendersByOrderId(order.id)).map((r) => r.orderItemId)).toEqual([items[0]!.id]);
  });

  it("records a generate and a combine under their own ledger types", async () => {
    const repos = getRepos();
    const { user, order, items } = await setup(repos);
    const key = randomUUID();

    await repos.purchaseRender(purchase(user.id, order.id, items[0]!.id));
    await repos.purchaseRender(
      purchase(user.id, order.id, items[0]!.id, { cost: 75, ledgerType: "SPEND_COMBINE", idempotencyKey: key }),
    );
    const replay = await repos.purchaseRender(purchase(user.id, order.id, items[0]!.id, { idempotencyKey: key }));

    expect(replay).toMatchObject({ status: "replayed", coinsSpent: 75, ledgerType: "SPEND_COMBINE" });
    const { transactions } = await repos.listCoinTransactions({ userId: user.id, limit: 5 });
    // Same-millisecond entries can list in either order on memory.
    expect(transactions.map((t) => [t.type, t.delta]).sort()).toEqual([
      ["GRANT", 500],
      ["SPEND_COMBINE", -75],
      ["SPEND_RENDER", -50],
    ]);
  });

  it("parallel purchases with one key charge once and make one render", async () => {
    const repos = getRepos();
    const { user, order, items } = await setup(repos);
    const key = randomUUID();

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => repos.purchaseRender(purchase(user.id, order.id, items[0]!.id, { idempotencyKey: key }))),
    );

    expect(results.map((r) => r.status).sort()).toEqual(["created", "replayed", "replayed", "replayed"]);
    const ids = results.map((r) => (r.status === "created" || r.status === "replayed" ? r.render?.id : null));
    expect(new Set(ids).size).toBe(1);
    expect(results.map((r) => ("coinsSpent" in r ? r.coinsSpent : null))).toEqual([50, 50, 50, 50]);
    expect(await repos.getCoinBalance(user.id)).toBe(450);
    expect(await repos.findRendersByOrderId(order.id)).toHaveLength(1);
  });

  it("a later repeat of the key returns the first render even if the body differs", async () => {
    const repos = getRepos();
    const { user, order, items } = await setup(repos);
    const key = randomUUID();
    const first = await repos.purchaseRender(purchase(user.id, order.id, items[0]!.id, { idempotencyKey: key }));
    const again = await repos.purchaseRender(
      purchase(user.id, order.id, items[1]!.id, { idempotencyKey: key, cost: 75 }),
    );

    expect(first.status).toBe("created");
    expect(again).toMatchObject({ status: "replayed", coinsSpent: 50 });
    expect(again.status === "replayed" && again.render?.id).toBe(first.status === "created" && first.render.id);
    expect(await repos.getCoinBalance(user.id)).toBe(450);
  });

  it("the same key on another order is a new purchase", async () => {
    const repos = getRepos();
    const { user, order, items } = await setup(repos);
    const variantId = await seedVariant(repos);
    const other = await repos.createOrder({
      userId: user.id,
      tier: "STANDARD",
      coinTotal: 0,
      stateEta: { PROCESSING: new Date().toISOString() },
      items: [{ listingVariantId: variantId, coinPriceSnapshot: 60, quantity: 1 }],
    });
    const key = randomUUID();

    await repos.purchaseRender(purchase(user.id, order.id, items[0]!.id, { idempotencyKey: key }));
    const onOther = await repos.purchaseRender(purchase(user.id, other.order.id, other.items[0]!.id, { idempotencyKey: key }));

    expect(onOther.status).toBe("created");
    expect(await repos.getCoinBalance(user.id)).toBe(400);
  });

  it("refuses when short, and for an item outside the user's order, without charging", async () => {
    const repos = getRepos();
    const { user, order, items } = await setup(repos, 40);
    const stranger = await setup(repos);

    expect(await repos.purchaseRender(purchase(user.id, order.id, items[0]!.id))).toMatchObject({
      status: "insufficient_coins",
      coinsNeeded: 50,
      balance: 40,
    });
    expect(await repos.purchaseRender(purchase(user.id, order.id, stranger.items[0]!.id, { cost: 10 }))).toEqual({
      status: "not_found",
    });
    expect(await repos.purchaseRender(purchase(user.id, stranger.order.id, stranger.items[0]!.id, { cost: 10 }))).toEqual({
      status: "not_found",
    });
    expect(await repos.getCoinBalance(user.id)).toBe(40);
    expect(await repos.findRendersByOrderId(order.id)).toEqual([]);
    expect(await repos.findRendersByOrderId(stranger.order.id)).toEqual([]);
  });
}
