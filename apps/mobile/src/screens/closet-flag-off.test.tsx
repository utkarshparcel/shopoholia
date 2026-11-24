import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FamilyShareConfirmScreen from '@/app/(closet)/family-share';
import ClosetPaywallScreen from '@/app/(closet)/paywall';
import { attributeReferral } from '@/src/api/client';
import { trackEvent } from '@/src/lib/analytics';
import { CLOSET_OFF_SUBTITLE } from '@/src/lib/closetScreenState';

const flags = vi.hoisted(() => ({ closet: false, paywall: false }));
const premium = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('@/src/lib/features', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get FEATURE_CLOSET() {
      return flags.closet;
    },
    get FEATURE_PAYWALL() {
      return flags.paywall;
    },
  };
});
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useLocalSearchParams: () => ({ code: 'HOME01' }),
}));
vi.mock('@/src/api/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  attributeReferral: vi.fn(async () => ({})),
}));
vi.mock('@/src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  trackEvent: vi.fn(),
}));
vi.mock('@/src/lib/purchases/useEntitlements', () => ({
  usePremiumPurchase: () => premium.value,
}));

beforeEach(() => {
  flags.closet = false;
  flags.paywall = false;
  vi.mocked(attributeReferral).mockClear();
  vi.mocked(trackEvent).mockClear();
  premium.value = {
    active: false,
    available: true,
    purchasable: true,
    loading: false,
    busy: null,
    notice: null,
    offerings: null,
    product: undefined,
    subscribe: vi.fn(),
    restore: vi.fn(),
    reload: vi.fn(),
  };
});

describe('Closet screens reached by deep link with the flag off (S1-21)', () => {
  it('family share credits no referral and shows user copy', () => {
    render(<FamilyShareConfirmScreen />);
    expect(attributeReferral).not.toHaveBeenCalled();
    expect(screen.getByText(CLOSET_OFF_SUBTITLE)).toBeTruthy();
    expect(screen.queryByText(/flag/i)).toBeNull();
  });

  it('family share still credits the referral with Closet on', () => {
    flags.closet = true;
    render(<FamilyShareConfirmScreen />);
    expect(attributeReferral).toHaveBeenCalledWith('HOME01', 'family_share');
  });

  it('paywall shows no env-var names and tracks no view', () => {
    render(<ClosetPaywallScreen />);
    expect(screen.getByText(CLOSET_OFF_SUBTITLE)).toBeTruthy();
    expect(screen.queryByText(/EXPO_PUBLIC/)).toBeNull();
    expect(trackEvent).not.toHaveBeenCalledWith('paywall_viewed');
  });

  it('paywall never prints "undefined/mo" when the store product has not loaded', () => {
    flags.closet = true;
    flags.paywall = true;
    render(<ClosetPaywallScreen />);
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.getByText(/billed monthly/)).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledWith('paywall_viewed');
  });
});
