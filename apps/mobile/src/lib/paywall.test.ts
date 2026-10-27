import { describe, expect, it } from 'vitest';
import type { PaywallOfferingsResponse } from '@worn/shared';
import { shouldShowPaywall, trialCtaLabel } from './paywall';

const OFFERINGS: PaywallOfferingsResponse = {
  offerings: [
    {
      productId: 'closet_premium_monthly',
      label: 'Closet Premium',
      entitlementIds: ['accountant', 'outfits'],
      trialDays: 7,
      priceLabel: '₹199',
      currency: 'INR',
    },
  ],
  gatesEnabled: true,
  provider: 'none',
};

describe('paywall helpers', () => {
  it('uses the store price in the trial CTA, never the server price label', () => {
    expect(trialCtaLabel(OFFERINGS, { priceString: '₹249.00', sample: false })).toBe(
      'Start 7-day free trial · ₹249.00/mo',
    );
  });

  it('labels a development sample price as a sample', () => {
    expect(trialCtaLabel(OFFERINGS, { priceString: '₹199', sample: true })).toBe(
      'Start 7-day free trial · Sample ₹199/mo',
    );
  });

  it('shows no price until the store returns one', () => {
    expect(trialCtaLabel(OFFERINGS, null)).toBe('Start 7-day free trial');
    expect(trialCtaLabel(null, null)).toBe('Start 7-day free trial');
  });

  it('shouldShowPaywall respects FEATURE_PAYWALL off by default', () => {
    // FEATURE_PAYWALL defaults false in test env → never force paywall
    expect(shouldShowPaywall('accountant', { grants: [] }, { gatesEnabled: true })).toBe(false);
  });
});
