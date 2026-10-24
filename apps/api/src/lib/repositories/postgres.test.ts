import { randomInt, randomUUID } from "node:crypto";
import { createDb, refreshTokens } from "@worn/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createStubPushService } from "../push/stub.js";
import { checkAndMarkRevealReady, seedOrderRenders } from "../render/pipeline.js";
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

  describe("refresh tokens", () => {
    it("keeps them across restarts, storing only a hash", async () => {
      const before = createPostgresRepositoriesFromUrl(databaseUrl!);
      const { user } = await before.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60_000);
      await before.saveRefreshToken({ token, userId: user.id, expiresAt });

      // A new repository instance with its own connection pool, as after a restart.
      const after = createPostgresRepositoriesFromUrl(databaseUrl!);
      expect(await after.findRefreshToken(token)).toEqual({ token, userId: user.id, expiresAt });

      const rows = await createDb(databaseUrl!)
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokenHash).not.toContain(token);

      await after.deleteRefreshToken(token);
      expect(await before.findRefreshToken(token)).toBeNull();
    });

    it("rejects and clears out expired tokens", async () => {
      const repos = createPostgresRepositoriesFromUrl(databaseUrl!);
      const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
      const expired = randomUUID();
      await repos.saveRefreshToken({
        token: expired,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1_000),
      });
      expect(await repos.findRefreshToken(expired)).toBeNull();

      const stale = randomUUID();
      await repos.saveRefreshToken({
        token: stale,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1_000),
      });
      const fresh = randomUUID();
      await repos.saveRefreshToken({
        token: fresh,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const rows = await createDb(databaseUrl!)
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(await repos.findRefreshToken(fresh)).toMatchObject({ userId: user.id });
    });
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

    it("applies a state change only from the expected state", async () => {
      const user = await userWithCoins(100);
      const variantId = await seedVariant(repos);
      const { order } = await repos.placeOrder(orderInput(user.id, variantId, 60));

      expect(await repos.updateOrderState(order.id, "OUT_FOR_DELIVERY", undefined, { from: "PACKED" })).toBeNull();
      expect((await repos.findOrderById(order.id))!.state).toBe("PROCESSING");
      const moved = await repos.updateOrderState(order.id, "PACKED", undefined, { from: "PROCESSING" });
      expect(moved?.state).toBe("PACKED");
      expect(moved?.stateEta).toEqual(order.stateEta);
    });

    it("marks an order revealed once when its free renders finish together", async () => {
      const user = await userWithCoins(100);
      const variantId = await seedVariant(repos);
      const { order } = await repos.placeOrder(orderInput(user.id, variantId, 60));
      await repos.updateOrderState(order.id, "DELIVERED");
      const renders = await seedOrderRenders(repos, order.id);
      for (const render of renders.filter((r) => r.isFree)) {
        await repos.updateRender(render.id, { status: "DONE", imageKey: "reveal/x.jpg" });
      }
      // Pause between reading the order and updating it so both callers read DELIVERED.
      const racing: Repositories = {
        ...repos,
        async findRendersByOrderId(orderId) {
          const rows = await repos.findRendersByOrderId(orderId);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return rows;
        },
      };
      const push = createStubPushService(racing);

      await Promise.all([
        checkAndMarkRevealReady({ repos: racing, push, orderId: order.id }),
        checkAndMarkRevealReady({ repos: racing, push, orderId: order.id }),
      ]);

      expect((await repos.findOrderById(order.id))!.state).toBe("REVEAL_READY");
      const events = await repos.listPushEvents(user.id);
      expect(events.filter((e) => e.eventType === "ORDER_REVEAL_READY")).toHaveLength(1);
    });

    it("treats a repeated push event as a no-op", async () => {
      const user = await userWithCoins(0);
      const event = {
        userId: user.id,
        orderId: null,
        eventType: "TEST",
        dedupeKey: `test:${randomUUID()}`,
        title: "t",
        body: "b",
        payload: { deepLink: "worn://x", screen: "order" as const, orderId: "x" },
        status: "QUEUED" as const,
      };

      const first = await repos.recordPushEvent(event);
      const second = await repos.recordPushEvent(event);

      expect(second.id).toBe(first.id);
    });

    it("finds in-flight orders and pending renders for restart recovery", async () => {
      const user = await userWithCoins(100);
      const variantId = await seedVariant(repos);
      const { order, items } = await repos.placeOrder(orderInput(user.id, variantId, 60));
      await repos.updateOrderState(order.id, "OUT_FOR_DELIVERY");

      const inTransit = await repos.listOrdersByStates(["PACKED", "OUT_FOR_DELIVERY"]);
      expect(inTransit.map((o) => o.id)).toContain(order.id);
      expect(await repos.listOrdersByStates(["REVEAL_READY"])).not.toContainEqual(
        expect.objectContaining({ id: order.id }),
      );
      expect(await repos.listOrdersByStates([])).toEqual([]);

      const base = {
        orderItemId: items[0]!.id,
        imageKey: null,
        provider: "",
        costMicros: 0,
      };
      const created = await repos.createRenders([
        { ...base, scenario: "STUDIO", isFree: true, unlocked: true, status: "QUEUED" },
        { ...base, scenario: "GOLDEN_HOUR", isFree: true, unlocked: true, status: "RUNNING" },
        { ...base, scenario: "STREET", isFree: false, unlocked: false, status: "QUEUED" },
        { ...base, scenario: "NIGHT", isFree: false, unlocked: true, status: "DONE" },
      ]);

      const pending = (await repos.listPendingRenders()).filter((p) =>
        created.some((r) => r.id === p.render.id),
      );
      expect(pending.map((p) => p.render.scenario).sort()).toEqual(["GOLDEN_HOUR", "STUDIO"]);
      expect(pending.every((p) => p.orderId === order.id)).toBe(true);
    });
  });
});
