import { randomInt, randomUUID } from "node:crypto";
import { AFFILIATE_CASHBACK_COINS, streakRewardForDay } from "@worn/shared";
import { describe, expect, it } from "vitest";
import { CartChangedError, IdempotencyKeyConflictError } from "./errors.js";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// Parallel taps on coin earns and spends. The same cases run on memory (always) and Postgres
// (with DATABASE_URL).
describe("memory coin races", () => {
  const repos = createMemoryRepositories();
  coinRaceCases(() => repos);
});

describePostgres("Postgres coin races", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  coinRaceCases(() => repos);
});

async function newUser(repos: Repositories) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  return user;
}

function coinRaceCases(getRepos: () => Repositories) {
  it("streak: parallel claims pay one day once", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const before = await repos.getCoinBalance(user.id);
    const results = await Promise.all([1, 2, 3, 4].map(() => repos.claimStreak(user.id)));
    expect(results.map((r) => r.coinsGranted).sort((a, b) => b - a)).toEqual([
      streakRewardForDay(1),
      0,
      0,
      0,
    ]);
    expect(await repos.getCoinBalance(user.id)).toBe(before + streakRewardForDay(1));
    expect(await repos.getStreakStatus(user.id)).toMatchObject({
      streakCount: 1,
      todayClaimed: true,
      nextStreakDay: 2,
    });
  });

  it("cashback: parallel confirms of one click pay once", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const clickId = `test:${randomUUID()}`;
    await repos.recordCashbackEvent({ userId: user.id, listingId: null, platform: "amazon", clickId });
    const before = await repos.getCoinBalance(user.id);

    await Promise.all([1, 2, 3, 4].map(() => repos.confirmCashback(clickId, "CONFIRMED")));

    expect(await repos.getCoinBalance(user.id)).toBe(before + AFFILIATE_CASHBACK_COINS);
    expect(await repos.listCashbackEvents(user.id)).toMatchObject([
      { status: "CONFIRMED", coinsEarned: AFFILIATE_CASHBACK_COINS },
    ]);
  });

  it("cashback: a repeated click keeps a confirmed event, so it can't pay again", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const clickId = `test:${randomUUID()}`;
    const click = () => repos.recordCashbackEvent({ userId: user.id, listingId: null, platform: "amazon", clickId });
    await click();
    const before = await repos.getCoinBalance(user.id);
    await repos.confirmCashback(clickId, "CONFIRMED");

    await click();
    await repos.confirmCashback(clickId, "CONFIRMED");

    expect(await repos.getCoinBalance(user.id)).toBe(before + AFFILIATE_CASHBACK_COINS);
    expect(await repos.listCashbackEvents(user.id)).toMatchObject([{ status: "CONFIRMED" }]);
  });

  it("cashback: a rejected click stays rejected and unpaid", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const clickId = `test:${randomUUID()}`;
    await repos.recordCashbackEvent({ userId: user.id, listingId: null, platform: "amazon", clickId });
    const before = await repos.getCoinBalance(user.id);
    await Promise.all([
      repos.confirmCashback(clickId, "REJECTED"),
      repos.confirmCashback(clickId, "REJECTED"),
    ]);
    await repos.confirmCashback(clickId, "CONFIRMED");
    await repos.confirmCashback(`test:${randomUUID()}`, "CONFIRMED");
    expect(await repos.getCoinBalance(user.id)).toBe(before);
    expect(await repos.listCashbackEvents(user.id)).toMatchObject([{ status: "REJECTED", coinsEarned: 0 }]);
  });

  it("referral: parallel applies of different codes refer the user once", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const referrers = await Promise.all([newUser(repos), newUser(repos), newUser(repos)]);
    const codes = await Promise.all(
      referrers.map(async (referrer) => {
        const code = `R${randomInt(10 ** 8, 10 ** 9)}`;
        await repos.updateUser(referrer.id, { referralCode: code });
        return code;
      }),
    );
    const results = await Promise.all(codes.map((code) => repos.applyReferralCode(user.id, code)));
    const applied = results.filter((result) => result !== null);
    expect(applied).toHaveLength(1);
    // The one that answered "applied" is the referrer the user really has.
    expect((await repos.findUserById(user.id))?.referredBy).toBe(applied[0]!.referredBy);
  });

  it("checkout: two parallel orders from one cart charge it once", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    await repos.grantCoins({ userId: user.id, delta: 500, type: "GRANT", refType: "test" });
    const listingId = randomUUID();
    const variantId = randomUUID();
    await repos.seedListings(
      [
        {
          id: listingId,
          sellerId: null,
          title: "Race Tee",
          category: `race-${listingId.slice(0, 8)}`,
          tags: [],
          coinPrice: 60,
          realPrice: null,
          productImageKeys: [],
          houseModelRenderKey: "house-models/x.jpg",
          affiliateUrl: null,
          affiliateLinks: null,
          status: "ACTIVE",
          sortOrder: 2_000_000_200,
          createdAt: new Date(),
        },
      ],
      [{ id: variantId, listingId, size: "M", color: "Black", garmentImageKey: "garments/x.jpg" }],
    );
    const cart = await repos.getOrCreateCart(user.id);
    await repos.addCartItem({ cartId: cart.id, listingVariantId: variantId, coinPriceSnapshot: 60, quantity: 1 });
    const lines = await repos.getCartItems(cart.id);
    const before = await repos.getCoinBalance(user.id);

    const place = (idempotencyKey: string) =>
      repos.placeOrder({
        userId: user.id,
        tier: "STANDARD",
        coinTotal: 60,
        stateEta: { PROCESSING: new Date().toISOString() },
        idempotencyKey,
        items: [{ listingVariantId: variantId, coinPriceSnapshot: 60, quantity: 1 }],
        cartItems: lines.map((line) => ({ id: line.id, quantity: line.quantity })),
      });
    const results = await Promise.allSettled([place(randomUUID()), place(randomUUID())]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(CartChangedError);
    expect(await repos.getCoinBalance(user.id)).toBe(before - 60);
    expect(await repos.listOrdersByUserId(user.id)).toHaveLength(1);
    expect(await repos.getCartItems(cart.id)).toEqual([]);
  });

  it("coin history: pages follow the cursor through every entry once", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const other = await newUser(repos);
    // Back-to-back grants: several land in the same millisecond.
    for (let i = 0; i < 7; i += 1) {
      await repos.grantCoins({ userId: user.id, delta: i + 1, type: "GRANT", refType: "test" });
    }
    const seen: number[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await repos.listCoinTransactions({ userId: user.id, cursor, limit: 2 });
      seen.push(...result.transactions.map((tx) => tx.delta));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    expect(seen).toEqual([7, 6, 5, 4, 3, 2, 1]);
    // Someone else's entry id is no cursor into this user's history.
    await repos.grantCoins({ userId: other.id, delta: 1, type: "GRANT", refType: "test" });
    const [theirEntry] = (await repos.listCoinTransactions({ userId: other.id, limit: 1 })).transactions;
    const fromTheirs = await repos.listCoinTransactions({ userId: user.id, cursor: theirEntry!.id, limit: 50 });
    expect(fromTheirs.transactions).toHaveLength(7);
  });

  it("checkout: another user's idempotency key is a conflict, not a crash", async () => {
    const repos = getRepos();
    const [a, b] = [await newUser(repos), await newUser(repos)];
    const key = randomUUID();
    const input = (userId: string) => ({
      userId,
      tier: "STANDARD" as const,
      coinTotal: 0,
      stateEta: { PROCESSING: new Date().toISOString() },
      idempotencyKey: key,
      items: [],
    });
    await repos.placeOrder(input(a.id));
    await expect(repos.placeOrder(input(b.id))).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
  });
}
