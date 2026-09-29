import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InsufficientCoinsError } from "./errors.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("createPostgresRepositories", () => {
  it("creates and finds users", async () => {
    const repos = createPostgresRepositoriesFromUrl(databaseUrl!);
    const phone = `9${Date.now()}`.slice(0, 12);
    const { user, isNew } = await repos.createUser(phone);
    expect(isNew).toBe(true);
    expect(await repos.findUserByPhone(phone)).toEqual(user);
    expect(await repos.findUserById(user.id)).toEqual(user);
  });

  it("manages coin ledger", async () => {
    const repos = createPostgresRepositoriesFromUrl(databaseUrl!);
    const phone = `9${Date.now() + 1}`.slice(0, 12);
    const { user } = await repos.createUser(phone);

    const grant = await repos.grantCoins({
      userId: user.id,
      delta: 100,
      type: "GRANT",
    });
    expect(grant.balanceAfter).toBe(100);
    expect(await repos.getCoinBalance(user.id)).toBe(100);

    await repos.spendCoins({
      userId: user.id,
      delta: 40,
      type: "SPEND_ORDER",
    });
    expect(await repos.getCoinBalance(user.id)).toBe(60);
  });

  it("manages carts and orders", async () => {
    const repos = createPostgresRepositoriesFromUrl(databaseUrl!);
    const phone = `9${Date.now() + 2}`.slice(0, 12);
    const { user } = await repos.createUser(phone);

    const cart = await repos.getOrCreateCart(user.id);
    expect(cart.userId).toBe(user.id);

    const { order } = await repos.createOrder({
      userId: user.id,
      tier: "EXPRESS",
      coinTotal: 10,
      stateEta: { PROCESSING: new Date().toISOString() },
      items: [],
    });
    expect(order.state).toBe("PROCESSING");
    expect(await repos.findOrderById(order.id)).toBeTruthy();
  });

  describe("checkout and coins", () => {
    const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

    async function userWithCoins(balance: number) {
      const phone = `9${randomInt(10 ** 10, 10 ** 11)}`;
      const { user } = await repos.createUser(phone);
      await repos.grantCoins({ userId: user.id, delta: balance, type: "GRANT" });
      return user;
    }

    async function seedVariant(r: Repositories) {
      const listingId = randomUUID();
      const variantId = randomUUID();
      await r.seedListings(
        [
          {
            id: listingId,
            sellerId: null,
            title: "Test tee",
            category: "Tops",
            tags: [],
            coinPrice: 60,
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
        [{ id: variantId, listingId, size: "M", color: "Black", garmentImageKey: "g.jpg" }],
      );
      return variantId;
    }

    function orderInput(userId: string, variantId: string, coinTotal: number, key?: string) {
      return {
        userId,
        tier: "EXPRESS" as const,
        coinTotal,
        stateEta: { PROCESSING: new Date().toISOString() },
        idempotencyKey: key,
        items: [{ listingVariantId: variantId, coinPriceSnapshot: coinTotal, quantity: 1 }],
      };
    }

    it("places an order and debits its coins in one transaction", async () => {
      const user = await userWithCoins(100);
      const variantId = await seedVariant(repos);

      const placed = await repos.placeOrder(orderInput(user.id, variantId, 60));

      expect(placed.created).toBe(true);
      expect(placed.items).toHaveLength(1);
      expect(await repos.getCoinBalance(user.id)).toBe(40);
      const { transactions } = await repos.listCoinTransactions({ userId: user.id, limit: 5 });
      expect(transactions[0]).toMatchObject({
        type: "SPEND_ORDER",
        delta: -60,
        refId: placed.order.id,
        balanceAfter: 40,
      });
    });

    it("rejects an order the balance cannot cover without creating it", async () => {
      const user = await userWithCoins(50);
      const variantId = await seedVariant(repos);

      await expect(repos.placeOrder(orderInput(user.id, variantId, 60))).rejects.toBeInstanceOf(
        InsufficientCoinsError,
      );
      expect(await repos.listOrdersByUserId(user.id)).toEqual([]);
      expect(await repos.getCoinBalance(user.id)).toBe(50);
    });

    it("lets only one of two simultaneous orders through when coins cover one", async () => {
      const user = await userWithCoins(150);
      const variantId = await seedVariant(repos);

      const results = await Promise.allSettled([
        repos.placeOrder(orderInput(user.id, variantId, 100)),
        repos.placeOrder(orderInput(user.id, variantId, 100)),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(InsufficientCoinsError);
      expect(await repos.listOrdersByUserId(user.id)).toHaveLength(1);
      expect(await repos.getCoinBalance(user.id)).toBe(50);
    });

    it("charges once when an idempotency key is replayed concurrently", async () => {
      const user = await userWithCoins(500);
      const variantId = await seedVariant(repos);
      const key = randomUUID();

      const [a, b] = await Promise.all([
        repos.placeOrder(orderInput(user.id, variantId, 100, key)),
        repos.placeOrder(orderInput(user.id, variantId, 100, key)),
      ]);

      expect(a.order.id).toBe(b.order.id);
      expect([a.created, b.created].sort()).toEqual([false, true]);
      expect(await repos.listOrdersByUserId(user.id)).toHaveLength(1);
      expect(await repos.getCoinBalance(user.id)).toBe(400);
    });

    it("keeps the latest balance right under concurrent spends", async () => {
      const user = await userWithCoins(100);

      await Promise.all(
        Array.from({ length: 10 }, () =>
          repos.spendCoins({ userId: user.id, delta: 10, type: "SPEND_ORDER" }),
        ),
      );

      expect(await repos.getCoinBalance(user.id)).toBe(0);
      await expect(
        repos.spendCoins({ userId: user.id, delta: 1, type: "SPEND_ORDER" }),
      ).rejects.toBeInstanceOf(InsufficientCoinsError);
    });
  });
});
