import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../repositories/memory.js";
import { createStubPushService } from "../push/stub.js";
import type { JobQueue } from "../jobs/queue.js";
import { CheckoutError, checkoutOrder } from "./checkout.js";

async function setup({ balance, price }: { balance: number; price: number }) {
  const repos = createMemoryRepositories();
  const { user } = await repos.createUser("919876543210");
  await repos.grantCoins({ userId: user.id, delta: balance, type: "GRANT" });

  const listingId = randomUUID();
  const variantId = randomUUID();
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Linen shirt",
        category: "Tops",
        tags: [],
        coinPrice: price,
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
    [{ id: variantId, listingId, size: "M", color: "White", garmentImageKey: "garments/x.jpg" }],
  );

  const cart = await repos.getOrCreateCart(user.id);
  await repos.addCartItem({
    cartId: cart.id,
    listingVariantId: variantId,
    coinPriceSnapshot: price,
    quantity: 1,
  });

  const scheduleOrderLadder = vi.fn(async () => undefined);
  const deps = {
    repos,
    push: createStubPushService(repos),
    jobQueue: { scheduleOrderLadder } as unknown as JobQueue,
  };
  return { repos, user, cart, deps, scheduleOrderLadder };
}

describe("checkoutOrder", () => {
  it("rejects empty cart", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919876543210");
    await repos.grantCoins({ userId: user.id, delta: 500, type: "GRANT" });

    await expect(
      checkoutOrder(
        {
          repos,
          push: createStubPushService(repos),
          jobQueue: { scheduleOrderLadder: vi.fn() } as unknown as JobQueue,
        },
        { userId: user.id, tier: "EXPRESS" },
      ),
    ).rejects.toBeInstanceOf(CheckoutError);
  });

  it("creates the order and debits its coins together", async () => {
    const { repos, user, cart, deps, scheduleOrderLadder } = await setup({
      balance: 500,
      price: 120,
    });

    const order = await checkoutOrder(deps, { userId: user.id, tier: "EXPRESS" });

    expect(order.state).toBe("PROCESSING");
    expect(order.coinTotal).toBe(120);
    expect(await repos.getCoinBalance(user.id)).toBe(380);
    const { transactions } = await repos.listCoinTransactions({ userId: user.id, limit: 10 });
    expect(transactions[0]).toMatchObject({
      type: "SPEND_ORDER",
      delta: -120,
      refType: "order",
      refId: order.id,
      balanceAfter: 380,
    });
    expect(await repos.getCartItems(cart.id)).toEqual([]);
    expect(scheduleOrderLadder).toHaveBeenCalledExactlyOnceWith(order.id);
  });

  it("rejects an order the balance cannot cover without creating it", async () => {
    const { repos, user, deps, scheduleOrderLadder } = await setup({ balance: 50, price: 120 });

    const attempt = checkoutOrder(deps, { userId: user.id, tier: "EXPRESS" });

    await expect(attempt).rejects.toMatchObject({ code: "INSUFFICIENT_COINS" });
    expect(await repos.listOrdersByUserId(user.id)).toEqual([]);
    expect(await repos.getCoinBalance(user.id)).toBe(50);
    expect(scheduleOrderLadder).not.toHaveBeenCalled();
  });

  it("lets only one of two simultaneous checkouts through when coins cover one", async () => {
    const { repos, user, deps, scheduleOrderLadder } = await setup({ balance: 150, price: 100 });

    const results = await Promise.allSettled([
      checkoutOrder(deps, { userId: user.id, tier: "EXPRESS" }),
      checkoutOrder(deps, { userId: user.id, tier: "EXPRESS" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "INSUFFICIENT_COINS",
    });
    expect(await repos.listOrdersByUserId(user.id)).toHaveLength(1);
    expect(await repos.getCoinBalance(user.id)).toBe(50);
    expect(scheduleOrderLadder).toHaveBeenCalledTimes(1);
  });

  it("charges once when the same idempotency key is retried", async () => {
    const { repos, user, deps, scheduleOrderLadder } = await setup({ balance: 500, price: 100 });
    const idempotencyKey = randomUUID();

    const [first, second] = await Promise.all([
      checkoutOrder(deps, { userId: user.id, tier: "EXPRESS", idempotencyKey }),
      checkoutOrder(deps, { userId: user.id, tier: "EXPRESS", idempotencyKey }),
    ]);
    const retry = await checkoutOrder(deps, {
      userId: user.id,
      tier: "EXPRESS",
      idempotencyKey,
    });

    expect(second.id).toBe(first.id);
    expect(retry.id).toBe(first.id);
    expect(await repos.listOrdersByUserId(user.id)).toHaveLength(1);
    expect(await repos.getCoinBalance(user.id)).toBe(400);
    expect(scheduleOrderLadder).toHaveBeenCalledTimes(1);
  });

  it("does not hand out another user's order for a reused idempotency key", async () => {
    const { repos, user, deps } = await setup({ balance: 500, price: 100 });
    const idempotencyKey = randomUUID();
    const order = await checkoutOrder(deps, { userId: user.id, tier: "EXPRESS", idempotencyKey });

    const { user: other } = await repos.createUser("919876543211");
    await repos.grantCoins({ userId: other.id, delta: 500, type: "GRANT" });
    const otherCart = await repos.getOrCreateCart(other.id);
    const [item] = await repos.listOrderItemsByOrderId(order.id);
    await repos.addCartItem({
      cartId: otherCart.id,
      listingVariantId: item!.listingVariantId,
      coinPriceSnapshot: 100,
      quantity: 1,
    });

    await expect(
      checkoutOrder(deps, { userId: other.id, tier: "EXPRESS", idempotencyKey }),
    ).rejects.toThrow("Idempotency key already used");
    expect(await repos.getCoinBalance(other.id)).toBe(500);
  });
});
