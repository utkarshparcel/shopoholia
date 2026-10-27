import { describe, expect, it } from 'vitest';
import { preferredCheckoutMethod, shouldShowPaywall, trialCtaLabel } from './paywall';

describe('paywall helpers', () => {
  it('builds trial CTA from offerings', () => {
    const label = trialCtaLabel({
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
    });
    expect(label).toMatch(/7-day/);
    expect(label).toMatch(/₹199|trial/i);
  });

  it('shouldShowPaywall respects FEATURE_PAYWALL off by default', () => {
    // FEATURE_PAYWALL defaults false in test env → never force paywall
    expect(
      shouldShowPaywall('accountant', { grants: [] }, { gatesEnabled: true }),
    ).toBe(false);
  });

  it('preferredCheckoutMethod returns a supported method', () => {
    expect(['upi', 'iap', 'card']).toContain(preferredCheckoutMethod());
  });
});
