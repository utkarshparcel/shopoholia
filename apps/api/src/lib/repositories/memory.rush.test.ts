import { describe, expect, it } from "vitest";
import { InsufficientCoinsError } from "./errors.js";
import { createMemoryRepositories } from "./memory.js";

const COST = 25;
const RUSHED_ETA = {
  PROCESSING: "2026-09-29T10:00:00.000Z",
  PACKED: "2026-09-29T10:25:00.000Z",
  OUT_FOR_DELIVERY: "2026-09-29T11:25:00.000Z",
  ARRIVING_SOON: "2026-09-29T11:55:00.000Z",
  DELIVERED: "2026-09-29T12:00:00.000Z",
};

async function setup(balance = 100) {
  const repos = createMemoryRepositories();
  const { user } = await repos.createUser("919876543210");
  await repos.grantCoins({ userId: user.id, delta: balance, type: "GRANT" });
  const { order } = await repos.createOrder({
    userId: user.id,
    tier: "STANDARD",
    coinTotal: 0,
    stateEta: { PROCESSING: RUSHED_ETA.PROCESSING, PACKED: "2026-09-29T13:00:00.000Z" },
    items: [],
  });
  const input = {
    userId: user.id,
    orderId: order.id,
    costCoins: COST,
    from: "PROCESSING" as const,
    stateEta: RUSHED_ETA,
  };
  const rushSpends = async () =>
    (await repos.listCoinTransactions({ userId: user.id, limit: 50 })).transactions.filter(
      (tx) => tx.type === "SPEND_RUSH",
    );
  return { repos, user, order, input, rushSpends };
}

describe("memory rushOrderToExpress", () => {
  it("debits the rush and switches the order to Express in one step", async () => {
    const { repos, user, order, input, rushSpends } = await setup();

    const rushed = await repos.rushOrderToExpress(input);

    expect(rushed).toMatchObject({
      balanceAfter: 75,
      order: { id: order.id, tier: "EXPRESS", state: "PROCESSING", stateEta: RUSHED_ETA },
    });
    expect(await repos.findOrderById(order.id)).toEqual(rushed!.order);
    expect(await repos.getCoinBalance(user.id)).toBe(75);
    expect((await repos.findUserById(user.id))!.coinBalanceCache).toBe(75);
    expect(await rushSpends()).toMatchObject([
      { delta: -COST, refType: "order", refId: order.id, balanceAfter: 75 },
    ]);
  });

  it("throws InsufficientCoinsError and changes nothing when coins are short", async () => {
    const { repos, user, order, input, rushSpends } = await setup(COST - 1);

    await expect(repos.rushOrderToExpress(input)).rejects.toBeInstanceOf(InsufficientCoinsError);

    expect(await repos.findOrderById(order.id)).toEqual(order);
    expect(await repos.getCoinBalance(user.id)).toBe(COST - 1);
    expect(await rushSpends()).toEqual([]);
  });

  it("changes nothing once the order has moved on from the planned state", async () => {
    const { repos, order, input, rushSpends } = await setup();
    const packed = await repos.updateOrderState(order.id, "PACKED");

    expect(await repos.rushOrderToExpress(input)).toBeNull();
    expect(await repos.findOrderById(order.id)).toEqual(packed);
    expect(await rushSpends()).toEqual([]);
  });

  it("never rushes an Express order, so a repeat can't charge twice", async () => {
    const { repos, user, input, rushSpends } = await setup();
    await repos.rushOrderToExpress(input);

    expect(await repos.rushOrderToExpress(input)).toBeNull();
    expect(await repos.getCoinBalance(user.id)).toBe(75);
    expect(await rushSpends()).toHaveLength(1);
  });

  it("only rushes the user's own order", async () => {
    const { repos, order, input } = await setup();
    const { user: other } = await repos.createUser("919999999999");
    await repos.grantCoins({ userId: other.id, delta: 100, type: "GRANT" });

    expect(await repos.rushOrderToExpress({ ...input, userId: other.id })).toBeNull();
    expect(await repos.getCoinBalance(other.id)).toBe(100);
    expect(await repos.findOrderById(order.id)).toEqual(order);
  });

  it("charges once when two rushes race", async () => {
    const { repos, user, input, rushSpends } = await setup();

    const results = await Promise.all([
      repos.rushOrderToExpress(input),
      repos.rushOrderToExpress(input),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repos.getCoinBalance(user.id)).toBe(75);
    expect(await rushSpends()).toHaveLength(1);
  });
});
