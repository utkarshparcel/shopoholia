/**
 * MON-REVENUECAT / MON-UPI-REGIONAL — paywall helpers (no store SDK secrets).
 * Client decides CTA from offerings + region flags; purchase goes through API.
 */

import {
  canAccessPremiumSurface,
  selectPaymentMethod,
  type ClosetEntitlement,
  type EntitlementSnapshot,
  type PaywallOfferingsResponse,
} from '@worn/shared';

import {
  EXPERIMENT_UPI_CHECKOUT,
  FEATURE_PAYWALL,
  FEATURE_REVENUECAT,
  WORN_REGION,
} from './features';

export function paywallEnabled(): boolean {
  return FEATURE_PAYWALL;
}

export function preferredCheckoutMethod(): 'upi' | 'iap' | 'card' {
  return selectPaymentMethod({
    region: WORN_REGION === 'US' || WORN_REGION === 'GLOBAL' ? WORN_REGION : 'IN',
    upiExperimentEnabled: EXPERIMENT_UPI_CHECKOUT,
    revenueCatEnabled: FEATURE_REVENUECAT,
  });
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

export function trialCtaLabel(offerings: PaywallOfferingsResponse | null): string {
  const premium = offerings?.offerings.find((o) => o.productId === 'closet_premium_monthly');
  const days = premium?.trialDays ?? 7;
  const price = premium?.priceLabel ?? '';
  if (preferredCheckoutMethod() === 'upi') {
    return price ? `Start ${days}-day trial · then ${price}/mo via UPI` : `Start ${days}-day trial`;
  }
  return price ? `Start ${days}-day free trial · ${price}/mo` : `Start ${days}-day free trial`;
}
