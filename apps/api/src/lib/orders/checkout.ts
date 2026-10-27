import {
  REFERRAL_REWARD_COINS,
  findDuplicateWarnings,
  type DeliveryTier,
  type DuplicateWarningResult,
} from "@worn/shared";
import { InsufficientCoinsError } from "../repositories/errors.js";
import type { PlaceOrderResult, Repositories } from "../repositories/types.js";
import { buildStateEta } from "./state-machine.js";
import type { JobQueue } from "../jobs/queue.js";
import type { PushService } from "../push/stub.js";
import {
  computeBudgetNudges,
  pickPrimaryBudgetNudge,
  type BudgetNudgePayload,
} from "../budget.js";
import {
  cartFingerprint,
  evaluateCoolingOffCheckout,
  readCoolingOffFromFlags,
  type CoolingOffHold,
} from "../cooling-off.js";
import {
  holdToReleasePayload,
  scheduleCoolingOffRelease,
} from "../cooling-off-jobs.js";
import { resolveCandidatePriceMinor } from "../prebuy-fit.js";
import { trackServerEvent } from "../analytics.js";
import type { OrderRecord } from "../repositories/types.js";

export type CheckoutDeps = {
  repos: Repositories;
  jobQueue: JobQueue;
  push: PushService;
};

export type CheckoutInput = {
  userId: string;
  tier: DeliveryTier;
  idempotencyKey?: string;
  /** User confirmed override of the 24h apparel cooling-off soft lock (N34). */
  coolingOffOverride?: boolean;
};

export type CheckoutResult = {
  order: OrderRecord;
  budgetNudge: BudgetNudgePayload | null;
  duplicateWarnings: DuplicateWarningResult[];
};

export async function checkoutOrder(
  deps: CheckoutDeps,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  if (input.idempotencyKey) {
    const existing = await deps.repos.findOrderByIdempotencyKey(input.idempotencyKey);
    if (existing?.userId === input.userId) {
      return { order: existing, budgetNudge: null, duplicateWarnings: [] };
    }
  }

  const cart = await deps.repos.getOrCreateCart(input.userId);
  const rows = await deps.repos.getCartItems(cart.id);
  if (rows.length === 0) {
    throw new CheckoutError("EMPTY_CART", "Add items to your haul before checkout");
  }

  const variantIds = rows.map((r) => r.listingVariantId);
  const variants = await deps.repos.findVariantsByIds(variantIds);
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const listingIds = Array.from(new Set(variants.map((v) => v.listingId)));
  const listings = await deps.repos.findListingsByIds(listingIds);
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  const items = [];
  let coinTotal = 0;
  const proposedForBudget: Array<{ category: string | null; priceMinor: number; qty: number }> =
    [];
  const candidates: Array<{ title: string; brand?: string | null; listingId: string }> = [];
  for (const row of rows) {
    const variant = variantMap.get(row.listingVariantId);
    if (!variant) {
      throw new CheckoutError("INVALID_CART", "Cart contains an unavailable item");
    }
    const listing = listingMap.get(variant.listingId);
    if (!listing || listing.status !== "ACTIVE") {
      throw new CheckoutError("INVALID_CART", "Cart contains an unavailable item");
    }
    coinTotal += row.coinPriceSnapshot * row.quantity;
    items.push({
      listingVariantId: row.listingVariantId,
      coinPriceSnapshot: row.coinPriceSnapshot,
      quantity: row.quantity,
    });
    const lineMinor = resolveCandidatePriceMinor({
      realPrice: listing.realPrice,
      coinPrice: row.coinPriceSnapshot,
      qty: 1,
    });
    proposedForBudget.push({
      category: listing.category,
      priceMinor: lineMinor,
      qty: row.quantity,
    });
    candidates.push({
      title: listing.title,
      brand: null,
      listingId: listing.id,
    });
  }

  // Soft budget nudge BEFORE placing order (WV08 soft; N34 apparel soft-lock)
  let budgetNudge: BudgetNudgePayload | null = null;
  let nudges: BudgetNudgePayload[] = [];
  try {
    nudges = await computeBudgetNudges(deps.repos, input.userId, proposedForBudget);
    budgetNudge = pickPrimaryBudgetNudge(nudges);
    if (budgetNudge?.exceeded) {
      trackServerEvent("budget_exceeded", {
        userId: input.userId,
        limitMinor: budgetNudge.limitMinor,
        actualMinor: budgetNudge.projectedMinor,
        category: budgetNudge.category,
      });
      trackServerEvent("budget_nudge_shown", {
        userId: input.userId,
        category: budgetNudge.category,
        projectedMinor: budgetNudge.projectedMinor,
      });
    }
  } catch {
    // ignore budget check failures for soft nudge — cooling-off still attempts below
  }

  // N34: 24h soft lock when apparel haul would exceed APPAREL budget
  try {
    // C2: the hold is a user pref, written key-by-key with patchUserPrefs (never into consent_flags).
    const existingHold = readCoolingOffFromFlags(await deps.repos.getUserPrefs(input.userId));
    const fingerprint = cartFingerprint(
      rows.map((r) => ({ listingVariantId: r.listingVariantId, quantity: r.quantity })),
    );
    const decision = evaluateCoolingOffCheckout({
      nudges,
      existingHold,
      fingerprint,
      override: input.coolingOffOverride === true,
    });
    if (decision.action === "soft_lock") {
      if (decision.started) {
        await deps.repos.patchUserPrefs(input.userId, { coolingOff: decision.hold });
        void scheduleCoolingOffRelease(holdToReleasePayload(input.userId, decision.hold));
        trackServerEvent("cooling_off_started", {
          userId: input.userId,
          category: decision.hold.category,
          releaseAt: decision.hold.releaseAt,
        });
      }
      trackServerEvent("cooling_off_blocked", {
        userId: input.userId,
        category: decision.hold.category,
        releaseAt: decision.hold.releaseAt,
      });
      throw new CheckoutError("COOLING_OFF", decision.message, decision.hold);
    }
    if (decision.reason === "override" || decision.reason === "hold_expired") {
      if (existingHold) {
        await deps.repos.patchUserPrefs(input.userId, { coolingOff: null });
      }
      if (decision.reason === "override") {
        trackServerEvent("cooling_off_overridden", {
          userId: input.userId,
        });
      }
    } else if (existingHold && decision.reason === "no_apparel_overage") {
      await deps.repos.patchUserPrefs(input.userId, { coolingOff: null });
    }
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    // never block checkout on cooling-off infra failures
  }

  // Soft duplicate / rebuy warning (does not block)
  let duplicateWarnings: DuplicateWarningResult[] = [];
  try {
    const wardrobe = await deps.repos.listWardrobeItems(input.userId);
    const owned: Array<{
      id: string;
      brand: string | null;
      category: string | null;
      title: string | null;
    }> = wardrobe.map((w) => ({
      id: w.id,
      brand: w.brand,
      category: w.category,
      title: null,
    }));
    const prior = await deps.repos.listMerchantPurchases(input.userId);
    const priorIds = prior.map((p) => p.id);
    const priorItems =
      await deps.repos.listMerchantPurchaseItemsByPurchaseIds(priorIds);
    for (const [, list] of priorItems) {
      for (const it of list) {
        owned.push({
          id: it.id,
          brand: it.brand,
          category: it.category,
          title: it.title,
        });
      }
    }
    duplicateWarnings = findDuplicateWarnings(candidates, owned);
    if (duplicateWarnings.length > 0) {
      trackServerEvent("dup_rebuy_warned", {
        userId: input.userId,
        count: duplicateWarnings.length,
        source: "checkout",
      });
    }
  } catch {
    // never block checkout
  }

  const placedAt = new Date();
  const stateEta = buildStateEta(placedAt, input.tier);

  let placed: PlaceOrderResult;
  try {
    // Creates the order and debits the coins together; the balance is checked inside.
    placed = await deps.repos.placeOrder({
      userId: input.userId,
      tier: input.tier,
      coinTotal,
      stateEta,
      idempotencyKey: input.idempotencyKey,
      items,
    });
  } catch (error) {
    if (error instanceof InsufficientCoinsError) {
      throw new CheckoutError("INSUFFICIENT_COINS", "Not enough WORN coins for this haul");
    }
    throw error;
  }

  const { order } = placed;
  // A concurrent retry with the same idempotency key already placed (and is finishing) it.
  if (!placed.created) return { order, budgetNudge: null, duplicateWarnings: [] };

  await deps.repos.clearCart(cart.id);
  await deps.jobQueue.scheduleOrderLadder(order.id);

  const user = await deps.repos.findUserById(input.userId);
  if (user?.referredBy) {
    const existingOrders = await deps.repos.listOrdersByUserId(input.userId);
    if (existingOrders.length === 1) {
      await deps.repos.grantCoins({
        userId: user.referredBy,
        delta: REFERRAL_REWARD_COINS,
        type: "EARN_REFERRAL",
        refType: "order",
        refId: order.id,
      });
    }
  }

  await deps.push.send({
    userId: input.userId,
    orderId: order.id,
    eventType: "ORDER_PROCESSING",
    title: "Order confirmed",
    body: "We're getting your haul ready.",
  });

  return { order, budgetNudge, duplicateWarnings };
}

export class CheckoutError extends Error {
  constructor(
    readonly code: "EMPTY_CART" | "INVALID_CART" | "INSUFFICIENT_COINS" | "COOLING_OFF",
    message: string,
    readonly coolingOff: CoolingOffHold | null = null,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}
