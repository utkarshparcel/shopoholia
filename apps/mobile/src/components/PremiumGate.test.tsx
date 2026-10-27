import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureMocks = vi.hoisted(() => ({
  FEATURE_PREMIUM_GATES: true,
}));

const revenueCatMocks = vi.hoisted(() => ({
  canAccessClosetPremium: vi.fn(() => false),
  paywallCopyFor: vi.fn(() => ({
    title: 'Accountant Premium',
    subtitle: 'Budgets and ROI.',
    cta: 'Start free trial',
    trialDays: 7,
  })),
  startLocalTrial: vi.fn(),
}));

vi.mock('@/src/lib/features', () => ({
  get FEATURE_PREMIUM_GATES() {
    return featureMocks.FEATURE_PREMIUM_GATES;
  },
}));

vi.mock('@/src/lib/revenueCat', () => ({
  canAccessClosetPremium: revenueCatMocks.canAccessClosetPremium,
  paywallCopyFor: revenueCatMocks.paywallCopyFor,
  startLocalTrial: revenueCatMocks.startLocalTrial,
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { phone: string | null }) => unknown) =>
    sel({ phone: '919876543210' }),
}));

import { PremiumGate } from './PremiumGate';

describe('PremiumGate', () => {
  beforeEach(() => {
    featureMocks.FEATURE_PREMIUM_GATES = true;
    revenueCatMocks.canAccessClosetPremium.mockReset();
    revenueCatMocks.paywallCopyFor.mockClear();
    revenueCatMocks.startLocalTrial.mockClear();
    revenueCatMocks.canAccessClosetPremium.mockReturnValue(false);
  });

  it('renders children when gates are off', () => {
    featureMocks.FEATURE_PREMIUM_GATES = false;
    render(
      <PremiumGate surface="outfits">
        <span>today outfit</span>
      </PremiumGate>,
    );
    expect(screen.getByText('today outfit')).toBeTruthy();
    expect(screen.queryByTestId('paywall-outfits')).toBeNull();
  });

  it('renders children when entitled', () => {
    revenueCatMocks.canAccessClosetPremium.mockReturnValue(true);
    render(
      <PremiumGate surface="accountant">
        <span>budget chart</span>
      </PremiumGate>,
    );
    expect(screen.getByText('budget chart')).toBeTruthy();
    expect(screen.queryByTestId('paywall-accountant')).toBeNull();
  });

  it('shows paywall when gates on and not entitled', () => {
    render(
      <PremiumGate surface="accountant">
        <span>secret</span>
      </PremiumGate>,
    );
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.getByTestId('paywall-accountant')).toBeTruthy();
    expect(screen.getByText('Accountant Premium')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start free trial' })).toBeTruthy();
  });

  it('starts local trial on CTA press', () => {
    render(
      <PremiumGate surface="accountant">
        <span>secret</span>
      </PremiumGate>,
    );
    screen.getByRole('button', { name: 'Start free trial' }).click();
    expect(revenueCatMocks.startLocalTrial).toHaveBeenCalledWith(
      '919876543210',
      'closet_accountant_monthly',
    );
  });
});
