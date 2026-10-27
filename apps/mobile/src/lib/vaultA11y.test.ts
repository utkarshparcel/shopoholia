import { describe, expect, it } from 'vitest';

import {
  vaultExpiryCountdownA11yLabel,
  vaultTotalA11yLabel,
} from './vaultA11y';

describe('vaultA11y (W099)', () => {
  it('includes amount and currency on totals', () => {
    const label = vaultTotalA11yLabel(50_000, 'INR');
    expect(label).toMatch(/Found money/);
    expect(label).toMatch(/₹/);
    expect(label).toMatch(/INR/);
  });

  it('includes amount, currency, and expiry on countdown', () => {
    const label = vaultExpiryCountdownA11yLabel({
      merchant: 'Myntra',
      label: '2 days left',
      heroLine: 'Myntra · 2 days left',
      expiresAt: '2026-08-28T10:00:00.000Z',
      countdown: {
        expired: false,
        urgent: false,
        label: '2 days left',
        daysLeft: 2,
        hoursLeft: null,
      },
      balanceMinor: 12_500,
      currency: 'INR',
    });
    expect(label).toMatch(/Myntra/);
    expect(label).toMatch(/₹/);
    expect(label).toMatch(/INR/);
    expect(label).toMatch(/expires 2026-08-28/);
  });
});
