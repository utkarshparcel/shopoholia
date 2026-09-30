import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InsufficientCoinsError } from "./errors.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const COST = 25;
const RUSHED_ETA = {
  PROCESSING: "2026-09-29T10:00:00.000Z",
  PACKED: "2026-09-29T10:25:00.000Z",
  OUT_FOR_DELIVERY: "2026-09-29T11:25:00.000Z",
  ARRIVING_SOON: "2026-09-29T11:55:00.000Z",
  DELIVERED: "2026-09-29T12:00:00.000Z",
};

describePostgres("postgres rushOrderToExpress", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

  /** A user with `balance` coins and an empty Standard order still processing. */
  async function setup(balance = 100) {
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
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
    return { user, order, input, rushSpends };
  }

  it("debits the rush and switches the order to Express in one transaction", async () => {
    const { user, order, input, rushSpends } = await setup();

    const rushed = await repos.rushOrderToExpress(input);

    expect(rushed).toMatchObject({
      balanceAfter: 75,
      order: { id: order.id, tier: "EXPRESS", state: "PROCESSING", stateEta: RUSHED_ETA },
    });
    expect(await repos.findOrderById(order.id)).toMatchObject({
      tier: "EXPRESS",
      stateEta: RUSHED_ETA,
    });
    expect(await repos.getCoinBalance(user.id)).toBe(75);
    expect((await repos.findUserById(user.id))!.coinBalanceCache).toBe(75);
    expect(await rushSpends()).toMatchObject([
      { delta: -COST, refType: "order", refId: order.id, balanceAfter: 75 },
    ]);
  });

  it("throws InsufficientCoinsError and changes nothing when coins are short", async () => {
    const { user, order, input, rushSpends } = await setup(COST - 1);

    await expect(repos.rushOrderToExpress(input)).rejects.toBeInstanceOf(InsufficientCoinsError);

    expect(await repos.findOrderById(order.id)).toEqual(order);
    expect(await repos.getCoinBalance(user.id)).toBe(COST - 1);
    expect(await rushSpends()).toEqual([]);
  });

  it("changes nothing once the order has moved on from the planned state", async () => {
    const { order, input, rushSpends } = await setup();
    await repos.updateOrderState(order.id, "PACKED");

    expect(await repos.rushOrderToExpress(input)).toBeNull();
    expect(await repos.findOrderById(order.id)).toMatchObject({
      tier: "STANDARD",
      state: "PACKED",
      stateEta: order.stateEta,
    });
    expect(await rushSpends()).toEqual([]);
  });

  it("only rushes the user's own order", async () => {
    const { order, input } = await setup();
    const { user: other } = await setup();

    expect(await repos.rushOrderToExpress({ ...input, userId: other.id })).toBeNull();
    expect(await repos.getCoinBalance(other.id)).toBe(100);
    expect((await repos.findOrderById(order.id))!.tier).toBe("STANDARD");
  });

  it("charges once for a repeat, even when both arrive at once", async () => {
    const { user, input, rushSpends } = await setup();

    const results = await Promise.all([
      repos.rushOrderToExpress(input),
      repos.rushOrderToExpress(input),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repos.rushOrderToExpress(input)).toBeNull();

    expect(await repos.getCoinBalance(user.id)).toBe(75);
    expect(await rushSpends()).toHaveLength(1);
  });

  it("stays consistent when a delivery step lands at the same moment", async () => {
    const { user, order, input, rushSpends } = await setup();

    const [rushed, packed] = await Promise.all([
      repos.rushOrderToExpress(input),
      repos.updateOrderState(order.id, "PACKED", undefined, { from: "PROCESSING" }),
    ]);

    // The step always applies; the rush only if it got there first (planned from PROCESSING).
    expect(packed?.state).toBe("PACKED");
    const after = (await repos.findOrderById(order.id))!;
    expect(after.state).toBe("PACKED");
    if (rushed) {
      expect(after).toMatchObject({ tier: "EXPRESS", stateEta: RUSHED_ETA });
      expect(await rushSpends()).toHaveLength(1);
    } else {
      expect(after).toMatchObject({ tier: "STANDARD", stateEta: order.stateEta });
      expect(await rushSpends()).toEqual([]);
    }
    expect(await repos.getCoinBalance(user.id)).toBe(rushed ? 75 : 100);
  });

  it("shares the user's coin lock with their other spends", async () => {
    // 30 coins cover the rush (25) or the spend (10), not both.
    const { user, order, input } = await setup(30);

    const [rush, spend] = await Promise.allSettled([
      repos.rushOrderToExpress(input),
      repos.spendCoins({ userId: user.id, delta: 10, type: "SPEND_UNLOCK" }),
    ]);

    const succeeded = [rush, spend].filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);
    const failed = [rush, spend].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(InsufficientCoinsError);
    const rushedFirst = rush.status === "fulfilled";
    expect(await repos.getCoinBalance(user.id)).toBe(rushedFirst ? 5 : 20);
    expect((await repos.findOrderById(order.id))!.tier).toBe(rushedFirst ? "EXPRESS" : "STANDARD");
  });
});
