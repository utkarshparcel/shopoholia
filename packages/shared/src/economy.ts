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

/** Compressed timers for beta validation (~5 min total arc). */
export const TIER_TIMINGS_BETA: Record<DeliveryTier, TierTimings> = {
  EXPRESS: {
    PROCESSING: 30_000,
    PACKED: 60_000,
    OUT_FOR_DELIVERY: 120_000,
    ARRIVING_SOON: 180_000,
    DELIVERED: 300_000,
  },
  STANDARD: {
    PROCESSING: 30_000,
    PACKED: 60_000,
    OUT_FOR_DELIVERY: 120_000,
    ARRIVING_SOON: 180_000,
    DELIVERED: 300_000,
  },
  SLOW_BURN: {
    PROCESSING: 30_000,
    PACKED: 60_000,
    OUT_FOR_DELIVERY: 120_000,
    ARRIVING_SOON: 180_000,
    DELIVERED: 300_000,
  },
};

export const ONBOARDING_COIN_GRANT = 500;

export const FREE_REVEAL_RENDERS_PER_ITEM = 2;

export const REVEAL_UNLOCK_COST_COINS = 50;

export const RUSH_TO_EXPRESS_COST_COINS = 25;

export type EconomyMode = "beta" | "prod";

export function getTierTimings(mode: EconomyMode = "beta"): Record<DeliveryTier, TierTimings> {
  return mode === "prod" ? TIER_TIMINGS_PROD : TIER_TIMINGS_BETA;
}
