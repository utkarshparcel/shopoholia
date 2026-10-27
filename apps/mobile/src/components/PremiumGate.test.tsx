import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureMocks = vi.hoisted(() => ({
  FEATURE_PREMIUM_GATES: true,
}));

const gateMocks = vi.hoisted(() => ({
  usePremiumAccess: vi.fn(() => ({ allowed: false, checking: false })),
  push: vi.fn(),
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

vi.mock('@/src/lib/purchases/premiumAccess', () => ({
  paywallCopyFor: gateMocks.paywallCopyFor,
  startLocalTrial: gateMocks.startLocalTrial,
}));

vi.mock('@/src/lib/purchases/useEntitlements', () => ({
  usePremiumAccess: gateMocks.usePremiumAccess,
}));

vi.mock('expo-router', () => ({ router: { push: gateMocks.push } }));

const USER_ID = '00000000-0000-4000-8000-000000000020';
const dev = globalThis as { __DEV__?: boolean };

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string | null }) => unknown) => sel({ accessToken: 'token' }),
}));

vi.mock('@/src/lib/access-token', () => ({
  userIdFromAccessToken: (token: string | null) => (token ? USER_ID : null),
}));

import { PremiumGate } from './PremiumGate';

describe('PremiumGate', () => {
  beforeEach(() => {
    featureMocks.FEATURE_PREMIUM_GATES = true;
    gateMocks.usePremiumAccess.mockReset();
    gateMocks.paywallCopyFor.mockClear();
    gateMocks.startLocalTrial.mockClear();
    gateMocks.push.mockClear();
    gateMocks.usePremiumAccess.mockReturnValue({ allowed: false, checking: false });
    dev.__DEV__ = true;
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
    gateMocks.usePremiumAccess.mockReturnValue({ allowed: true, checking: false });
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

  it('shows neither the surface nor the paywall while entitlements load', () => {
    gateMocks.usePremiumAccess.mockReturnValue({ allowed: false, checking: true });
    render(
      <PremiumGate surface="accountant">
        <span>secret</span>
      </PremiumGate>,
    );
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start free trial' })).toBeNull();
  });

  it('starts local trial on CTA press in a development build', () => {
    render(
      <PremiumGate surface="accountant">
        <span>secret</span>
      </PremiumGate>,
    );
    screen.getByRole('button', { name: 'Start free trial' }).click();
    expect(gateMocks.startLocalTrial).toHaveBeenCalledWith(USER_ID, 'closet_accountant_monthly');
    expect(gateMocks.push).not.toHaveBeenCalled();
  });

  it('opens the store paywall on CTA press in a release build', () => {
    dev.__DEV__ = false;
    render(
      <PremiumGate surface="accountant">
        <span>secret</span>
      </PremiumGate>,
    );
    screen.getByRole('button', { name: 'Start free trial' }).click();
    expect(gateMocks.push).toHaveBeenCalledWith('/paywall');
    expect(gateMocks.startLocalTrial).not.toHaveBeenCalled();
    dev.__DEV__ = true;
  });
});
