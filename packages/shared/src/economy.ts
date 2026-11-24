import type { DeliveryTier } from "./schemas/order.js";

/** Milliseconds from checkout to each state transition (cumulative from order placed). */
export type TierTimings = Record<
  "PROCESSING" | "PACKED" | "OUT_FOR_DELIVERY" | "ARRIVING_SOON" | "DELIVERED",
  number
>;

export const TIER_TIMINGS_PROD: Record<DeliveryTier, TierTimings> = {
  EXPRESS: {
    PROCESSING: 5 * 60_000,
    PACKED: 25 * 60_000,
    OUT_FOR_DELIVERY: 85 * 60_000,
    ARRIVING_SOON: 115 * 60_000,
    DELIVERED: 120 * 60_000,
  },
  STANDARD: {
    PROCESSING: 60 * 60_000,
    PACKED: 3 * 60 * 60_000,
    OUT_FOR_DELIVERY: 8 * 60 * 60_000,
    ARRIVING_SOON: 10 * 60 * 60_000,
    DELIVERED: 12 * 60 * 60_000,
  },
  SLOW_BURN: {
    PROCESSING: 2 * 60 * 60_000,
    PACKED: 12 * 60 * 60_000,
    OUT_FOR_DELIVERY: 36 * 60 * 60_000,
    ARRIVING_SOON: 44 * 60 * 60_000,
    DELIVERED: 48 * 60 * 60_000,
  },
};

/**
 * Compressed timers for beta validation: Standard keeps the ~5 min arc, Express lands in ~2 min
 * and Slow burn in ~8 min. Every step is sooner on a faster tier, so Rush to Express has
 * something to speed up in beta as it does in prod.
 */
export const TIER_TIMINGS_BETA: Record<DeliveryTier, TierTimings> = {
  EXPRESS: {
    PROCESSING: 10_000,
    PACKED: 20_000,
    OUT_FOR_DELIVERY: 45_000,
    ARRIVING_SOON: 90_000,
    DELIVERED: 120_000,
  },
  STANDARD: {
    PROCESSING: 30_000,
    PACKED: 60_000,
    OUT_FOR_DELIVERY: 120_000,
    ARRIVING_SOON: 180_000,
    DELIVERED: 300_000,
  },
  SLOW_BURN: {
    PROCESSING: 60_000,
    PACKED: 120_000,
    OUT_FOR_DELIVERY: 240_000,
    ARRIVING_SOON: 360_000,
    DELIVERED: 480_000,
  },
};

export const ONBOARDING_COIN_GRANT = 500;

export const REFERRAL_REWARD_COINS = 100;
export const REFERRAL_GRANT_ON = "FIRST_ORDER" as const;

export const STREAK_REWARDS: Record<number, number> = {
  1: 10,
  3: 25,
  7: 50,
  14: 75,
  30: 100,
};

export function streakRewardForDay(day: number): number {
  const thresholds = Object.keys(STREAK_REWARDS).map(Number).sort((a, b) => b - a);
  for (const t of thresholds) {
    if (day >= t) return STREAK_REWARDS[t]!;
  }
  return STREAK_REWARDS[1]!;
}

/** A catalog piece costs about 1 coin per ₹10 of its shop price. */
export const CATALOG_RUPEES_PER_COIN = 10;
/** No catalog piece costs fewer coins than this. */
export const CATALOG_MIN_COIN_PRICE = 10;

/**
 * The coin price of a catalog piece from its shop price in rupees: ₹10 a coin, rounded to the
 * nearest 5 coins, at least CATALOG_MIN_COIN_PRICE (₹549 → 55, ₹405 → 40). The welcome grant
 * then buys a first haul of 4 to 6 pieces.
 */
export function coinPriceForRupees(rupees: number): number {
  const coins = Math.round(rupees / CATALOG_RUPEES_PER_COIN / 5) * 5;
  return Math.max(CATALOG_MIN_COIN_PRICE, coins);
}

export const AFFILIATE_CASHBACK_COINS = 25;

export const FREE_REVEAL_RENDERS_PER_ITEM = 1;

export const REVEAL_UNLOCK_COST_COINS = 50;
export const REVEAL_GENERATE_COST_COINS = 50;
export const REVEAL_COMBINE_COST_COINS = 75;
/** Most order items one combined render can put together. */
export const REVEAL_COMBINE_MAX_ITEMS = 4;

export const RUSH_TO_EXPRESS_COST_COINS = 25;

/**
 * Coin packs, sold only as consumable App Store / Google Play in-app products (`storeProductId`,
 * the same id on both stores). A verified purchase of a product credits exactly `coins`. `price` is
 * the intended price tier; the app shows the store's localized price.
 */
export const COIN_PACKS = [
  { id: "coins_small", storeProductId: "worn.coins.100", label: "Starter Pack", price: "₹99", coins: 100 },
  { id: "coins_medium", storeProductId: "worn.coins.350", label: "Style Pack", price: "₹299", coins: 350 },
  { id: "coins_large", storeProductId: "worn.coins.650", label: "Premium Pack", price: "₹499", coins: 650, popular: true },
  { id: "coins_xl", storeProductId: "worn.coins.1500", label: "Ultimate Pack", price: "₹999", coins: 1500, bestValue: true },
] as const;

export type CoinPack = (typeof COIN_PACKS)[number];

export function coinPackById(id: string): CoinPack | undefined {
  return COIN_PACKS.find((p) => p.id === id);
}

export function coinPackByStoreProductId(storeProductId: string): CoinPack | undefined {
  return COIN_PACKS.find((p) => p.storeProductId === storeProductId);
}

/**
 * Closet premium, sold only as auto-renewable App Store / Google Play subscriptions with the same
 * `storeProductId` on both stores. `productId` is the Closet product (CLOSET_PREMIUM_PRODUCTS) whose
 * entitlements an active subscription grants.
 */
export const PREMIUM_SUBSCRIPTIONS = [
  { storeProductId: "worn.closet.premium.monthly", productId: "closet_premium_monthly" },
  { storeProductId: "worn.closet.accountant.monthly", productId: "closet_accountant_monthly" },
  { storeProductId: "worn.closet.outfits.monthly", productId: "closet_outfits_monthly" },
] as const;

export type PremiumSubscription = (typeof PREMIUM_SUBSCRIPTIONS)[number];

export function premiumSubscriptionByStoreProductId(
  storeProductId: string,
): PremiumSubscription | undefined {
  return PREMIUM_SUBSCRIPTIONS.find((s) => s.storeProductId === storeProductId);
}

export function premiumSubscriptionByProductId(productId: string): PremiumSubscription | undefined {
  return PREMIUM_SUBSCRIPTIONS.find((s) => s.productId === productId);
}

export type EconomyMode = "beta" | "prod";

export function getTierTimings(mode: EconomyMode = "beta"): Record<DeliveryTier, TierTimings> {
  return mode === "prod" ? TIER_TIMINGS_PROD : TIER_TIMINGS_BETA;
}
