/**
 * Closet Premium paywall helpers. Premium is a digital subscription, so the app sells it only
 * through App Store / Google Play billing (`src/lib/purchases`), never a UPI or web checkout.
 * The price shown is the store's localized price.
 */

import {
  canAccessPremiumSurface,
  type ClosetEntitlement,
  type EntitlementSnapshot,
  type PaywallOfferingsResponse,
} from '@worn/shared';

import { FEATURE_PAYWALL } from './features';
import type { StoreProduct } from './purchases/types';

export const PREMIUM_PRODUCT_ID = 'closet_premium_monthly';

export function paywallEnabled(): boolean {
  return FEATURE_PAYWALL;
}

/** When gates are on and surface locked, show paywall CTA. */
export function shouldShowPaywall(
  surface: ClosetEntitlement,
  snapshot: Pick<EntitlementSnapshot, 'grants'> | null | undefined,
  opts?: { gatesEnabled?: boolean },
): boolean {
  if (!FEATURE_PAYWALL) return false;
  const gatesEnabled = opts?.gatesEnabled ?? true;
  return !canAccessPremiumSurface(surface, snapshot, { gatesEnabled });
}

/** "Start 7-day free trial · ₹199.00/mo" from the store product; a dev sample price says so. */
export function trialCtaLabel(
  offerings: PaywallOfferingsResponse | null,
  product: Pick<StoreProduct, 'priceString' | 'sample'> | null,
): string {
  const premium = offerings?.offerings.find((o) => o.productId === PREMIUM_PRODUCT_ID);
  const days = premium?.trialDays ?? 7;
  if (!product) return `Start ${days}-day free trial`;
  const price = product.sample ? `Sample ${product.priceString}` : product.priceString;
  return `Start ${days}-day free trial · ${price}/mo`;
}
