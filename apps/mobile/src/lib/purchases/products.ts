/**
 * App Store / Google Play product ids (iap-contract.md, section 3); each id is the same on both
 * stores. The server names the coin packs to sell (GET /coins/packs), so the app needs these only
 * offline: to tell a re-delivered transaction's kind, and to send /entitlements/sync the Closet
 * product id. The ids live in packages/shared/src/economy.ts (`COIN_PACKS`, `PREMIUM_SUBSCRIPTIONS`).
 */
import {
  coinPackByStoreProductId,
  premiumSubscriptionByProductId,
  premiumSubscriptionByStoreProductId,
} from '@worn/shared';

/** The Closet product (`closet_premium_monthly`) a store subscription id sells, if it is one. */
export function premiumProductIdFor(storeProductId: string): string | null {
  return premiumSubscriptionByStoreProductId(storeProductId)?.productId ?? null;
}

/** The store subscription id for a Closet product. */
export function premiumStoreProductIdFor(productId: string): string | null {
  return premiumSubscriptionByProductId(productId)?.storeProductId ?? null;
}

export function coinPackIdFor(storeProductId: string): string | null {
  return coinPackByStoreProductId(storeProductId)?.id ?? null;
}
