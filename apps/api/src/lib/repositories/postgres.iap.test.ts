import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { CoinPurchaseInput } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const DAY = 86_400_000;

describePostgres("Postgres coin purchases and store grants", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

  /** A user with a zero balance (new users start with the sign-up bonus). */
  async function newUser() {
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    const start = await repos.getCoinBalance(user.id);
    if (start > 0) await repos.spendCoins({ userId: user.id, delta: start, type: "SPEND_UNLOCK", refType: "test", refId: randomUUID() });
    return user;
  }

  function purchase(userId: string, overrides: Partial<CoinPurchaseInput> = {}): CoinPurchaseInput {
    return {
      userId,
      store: "app_store",
      transactionId: `tx-${randomUUID()}`,
      productId: "worn.coins.350",
      coins: 350,
      environment: "sandbox",
      source: "validate",
      ...overrides,
    };
  }

  it("credits a transaction once, even when the same purchase arrives in parallel", async () => {
    const user = await newUser();
    const input = purchase(user.id);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        repos.creditCoinPurchase({ ...input, source: i % 2 ? "notification" : "validate" }),
      ),
    );
    expect(results.filter((r) => r.status === "granted")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already_granted")).toHaveLength(5);
    const ids = new Set(results.map((r) => r.purchase.id));
    expect(ids.size).toBe(1);
    expect(await repos.getCoinBalance(user.id)).toBe(350);
    expect(await repos.findCoinPurchase("app_store", input.transactionId)).toMatchObject({
      userId: user.id,
      coinsGranted: 350,
      environment: "sandbox",
      refundedAt: null,
    });
    // The same id in the other store is a different purchase.
    expect((await repos.creditCoinPurchase({ ...input, store: "play_store" })).status).toBe("granted");
    expect(await repos.getCoinBalance(user.id)).toBe(700);
  });

  it("refuses a transaction another user already claimed, also when both race", async () => {
    const [a, b] = await Promise.all([newUser(), newUser()]);
    const transactionId = `tx-${randomUUID()}`;
    const results = await Promise.all([
      repos.creditCoinPurchase(purchase(a.id, { transactionId })),
      repos.creditCoinPurchase(purchase(b.id, { transactionId })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["granted", "other_user"]);
    const balances = [await repos.getCoinBalance(a.id), await repos.getCoinBalance(b.id)];
    expect(balances.sort()).toEqual([0, 350]);
  });

  it("takes refunded coins back once, never below zero, and records the shortfall", async () => {
    const user = await newUser();
    const input = purchase(user.id);
    await repos.creditCoinPurchase(input);
    await repos.spendCoins({ userId: user.id, delta: 300, type: "SPEND_UNLOCK", refType: "test", refId: randomUUID() });

    const refunds = await Promise.all(
      [1, 2, 3].map(() =>
        repos.refundCoinPurchase({ store: "app_store", transactionId: input.transactionId, source: "notification" }),
      ),
    );
    const done = refunds.filter((r) => r.status === "refunded");
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ debited: 50, shortfall: 300, balanceAfter: 0 });
    expect(refunds.filter((r) => r.status === "already_refunded")).toHaveLength(2);
    expect(await repos.getCoinBalance(user.id)).toBe(0);
    expect(await repos.findCoinPurchase("app_store", input.transactionId)).toMatchObject({
      refundedCoins: 50,
      refundShortfall: 300,
    });
    // A later validate of the same transaction grants nothing.
    const again = await repos.creditCoinPurchase(input);
    expect(again.status).toBe("already_granted");
    expect(await repos.getCoinBalance(user.id)).toBe(0);
  });

  it("remembers a refund that arrives before the grant", async () => {
    const user = await newUser();
    const input = purchase(user.id, { store: "play_store", productId: "worn.coins.100", coins: 100 });
    expect(
      await repos.refundCoinPurchase({ store: "play_store", transactionId: input.transactionId, source: "notification" }),
    ).toEqual({ status: "unknown" });
    const early = await repos.refundCoinPurchase({
      store: "play_store",
      transactionId: input.transactionId,
      userId: user.id,
      productId: input.productId,
      source: "notification",
    });
    expect(early).toMatchObject({ status: "refunded_before_grant", purchase: { coinsGranted: 0 } });
    const credit = await repos.creditCoinPurchase(input);
    expect(credit).toMatchObject({ status: "already_granted", purchase: { coinsGranted: 0 } });
    expect(await repos.getCoinBalance(user.id)).toBe(0);
  });

  it("stores store grants, ignores replayed and older events, and lists live subscriptions", async () => {
    const user = await newUser();
    const now = Date.now();
    const grant = (expiresAt: Date, eventAt: Date, storeRef: string | null) => ({
      entitlementId: "outfits" as const,
      productId: "closet_outfits_monthly",
      expiresAt,
      isTrial: false,
      source: "play_store" as const,
      eventAt,
      storeRef,
    });
    const eventId = `evt-${randomUUID()}`;
    expect(
      await repos.applyEntitlementGrants(user.id, [grant(new Date(now + 30 * DAY), new Date(now), `tok-${user.id}`)], eventId),
    ).toEqual({ applied: true });
    expect(
      await repos.applyEntitlementGrants(user.id, [grant(new Date(now + 90 * DAY), new Date(now), null)], eventId),
    ).toEqual({ applied: false });
    // An older event never overwrites a newer grant.
    await repos.applyEntitlementGrants(user.id, [grant(new Date(now - DAY), new Date(now - DAY), null)]);
    const [stored] = await repos.listEntitlementGrants(user.id);
    expect(stored!.expiresAt!.getTime()).toBe(now + 30 * DAY);
    expect(stored!.storeRef).toBe(`tok-${user.id}`);

    const live = await repos.listStoreSubscriptionGrants("play_store", new Date());
    expect(live).toContainEqual({ userId: user.id, productId: "closet_outfits_monthly", storeRef: `tok-${user.id}` });
    expect(await repos.listStoreSubscriptionGrants("app_store", new Date())).not.toContainEqual(
      expect.objectContaining({ userId: user.id }),
    );
    expect(await repos.listStoreSubscriptionGrants("play_store", new Date(now + 31 * DAY))).not.toContainEqual(
      expect.objectContaining({ userId: user.id }),
    );
  });
});
