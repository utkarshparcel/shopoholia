/**
 * App Store / Google Play product ids (iap-contract.md, section 3); each id is the same on both
 * stores. The server names the coin packs to sell (GET /coins/packs), so the app needs these only
 * offline: to tell a re-delivered transaction's kind, and to send /entitlements/sync the Closet
 * product id. Mirrors `COIN_PACKS[].storeProductId` and `PREMIUM_SUBSCRIPTIONS` in
 * packages/shared/src/economy.ts once platform's change lands; switch to those then.
 */

export const COIN_STORE_PRODUCTS = [
  { packId: 'coins_small', storeProductId: 'worn.coins.100' },
  { packId: 'coins_medium', storeProductId: 'worn.coins.350' },
  { packId: 'coins_large', storeProductId: 'worn.coins.650' },
  { packId: 'coins_xl', storeProductId: 'worn.coins.1500' },
] as const;

export const PREMIUM_STORE_PRODUCTS = [
  { storeProductId: 'worn.closet.premium.monthly', productId: 'closet_premium_monthly' },
  { storeProductId: 'worn.closet.accountant.monthly', productId: 'closet_accountant_monthly' },
  { storeProductId: 'worn.closet.outfits.monthly', productId: 'closet_outfits_monthly' },
] as const;

/** The Closet product (`closet_premium_monthly`) a store subscription id sells, if it is one. */
export function premiumProductIdFor(storeProductId: string): string | null {
  return PREMIUM_STORE_PRODUCTS.find((p) => p.storeProductId === storeProductId)?.productId ?? null;
}

/** The store subscription id for a Closet product. */
export function premiumStoreProductIdFor(productId: string): string | null {
  return PREMIUM_STORE_PRODUCTS.find((p) => p.productId === productId)?.storeProductId ?? null;
}

export function coinPackIdFor(storeProductId: string): string | null {
  return COIN_STORE_PRODUCTS.find((p) => p.storeProductId === storeProductId)?.packId ?? null;
}
