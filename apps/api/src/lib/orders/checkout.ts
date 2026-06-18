import type { DeliveryTier } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import { buildStateEta } from "./state-machine.js";
import type { JobQueue } from "../jobs/queue.js";
import type { PushService } from "../push/stub.js";

export type CheckoutDeps = {
  repos: Repositories;
  jobQueue: JobQueue;
  push: PushService;
};

export type CheckoutInput = {
  userId: string;
  tier: DeliveryTier;
  idempotencyKey?: string;
};

export async function checkoutOrder(deps: CheckoutDeps, input: CheckoutInput) {
  if (input.idempotencyKey) {
    const existing = await deps.repos.findOrderByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
  }

  const cart = await deps.repos.getOrCreateCart(input.userId);
  const rows = await deps.repos.getCartItems(cart.id);
  if (rows.length === 0) {
    throw new CheckoutError("EMPTY_CART", "Add items to your haul before checkout");
  }

  const items = [];
  let coinTotal = 0;
  for (const row of rows) {
    const variant = await deps.repos.findVariantById(row.listingVariantId);
    if (!variant) {
      throw new CheckoutError("INVALID_CART", "Cart contains an unavailable item");
    }
    const listing = await deps.repos.findListingById(variant.listingId);
    if (!listing || listing.status !== "ACTIVE") {
      throw new CheckoutError("INVALID_CART", "Cart contains an unavailable item");
    }
    coinTotal += row.coinPriceSnapshot * row.quantity;
    items.push({
      listingVariantId: row.listingVariantId,
      coinPriceSnapshot: row.coinPriceSnapshot,
      quantity: row.quantity,
    });
  }

  const balance = await deps.repos.getCoinBalance(input.userId);
  if (balance < coinTotal) {
    throw new CheckoutError("INSUFFICIENT_COINS", "Not enough WORN coins for this haul");
  }

  const placedAt = new Date();
  const stateEta = buildStateEta(placedAt, input.tier);

  const { order } = await deps.repos.createOrder({
    userId: input.userId,
    tier: input.tier,
    coinTotal,
    stateEta,
    idempotencyKey: input.idempotencyKey,
    items,
  });

  await deps.repos.spendCoins({
    userId: input.userId,
    delta: coinTotal,
    type: "SPEND_ORDER",
    refType: "order",
    refId: order.id,
  });

  await deps.repos.clearCart(cart.id);
  await deps.jobQueue.scheduleOrderLadder(order.id);
  await deps.push.send({
    userId: input.userId,
    orderId: order.id,
    eventType: "ORDER_PROCESSING",
    title: "Order confirmed",
    body: "We're getting your haul ready.",
  });

  return order;
}

export class CheckoutError extends Error {
  constructor(
    readonly code: "EMPTY_CART" | "INVALID_CART" | "INSUFFICIENT_COINS",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}
