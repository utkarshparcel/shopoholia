import { describe, expect, it } from 'vitest';

import {
  SAMPLE_MYNTRA_CREDIT,
  VAULT_EXPIRY_HREF,
  VAULT_FOUND_MONEY_HREF,
  VAULT_RETURNS_HREF,
  closetEntryHref,
  demoExitedProps,
  needsClosetOnboarding,
  secondsSince,
  skipPathSecondsProps,
  timeToFoundMoneyProps,
} from './firstDelight';

describe('needsClosetOnboarding', () => {
  const base = {
    featureCloset: true,
    hasMoneyAccounts: false,
    hasAnyConsent: false,
    onboardingSkipped: false,
    onboardingCompleted: false,
  };

  it('routes empty Closet users into compact onboarding', () => {
    expect(needsClosetOnboarding(base)).toBe(true);
    expect(closetEntryHref(base)).toBe('/(closet)/onboarding');
  });

  it('skips when Closet feature is off (Play unaffected)', () => {
    expect(needsClosetOnboarding({ ...base, featureCloset: false })).toBe(false);
    expect(closetEntryHref({ ...base, featureCloset: false })).toBe('/(closet)/today');
  });

  it('skips when user already has money accounts', () => {
    expect(needsClosetOnboarding({ ...base, hasMoneyAccounts: true })).toBe(false);
  });

  it('skips when any consent already exists', () => {
    expect(needsClosetOnboarding({ ...base, hasAnyConsent: true })).toBe(false);
  });

  it('respects skip and completed flags', () => {
    expect(needsClosetOnboarding({ ...base, onboardingSkipped: true })).toBe(false);
    expect(needsClosetOnboarding({ ...base, onboardingCompleted: true })).toBe(false);
  });
});

describe('first delight constants', () => {
  it('defines ₹500 Myntra sample', () => {
    expect(SAMPLE_MYNTRA_CREDIT.merchant).toBe('Myntra');
    expect(SAMPLE_MYNTRA_CREDIT.balanceMinor).toBe(50_000);
    expect(SAMPLE_MYNTRA_CREDIT.label).toMatch(/₹500/);
  });

  it('vault focus href', () => {
    expect(VAULT_FOUND_MONEY_HREF).toEqual({
      pathname: '/(closet)/vault',
      params: { focus: 'found-money' },
    });
  });

  it('expiry deep link lands on vault countdown hero (W016)', () => {
    expect(VAULT_EXPIRY_HREF).toEqual({
      pathname: '/(closet)/vault',
      params: { focus: 'expiry' },
    });
  });

  it('returns deep link lands on Vault Returns tab', () => {
    expect(VAULT_RETURNS_HREF).toEqual({
      pathname: '/(closet)/vault',
      params: { focus: 'returns' },
    });
  });
});

describe('time_to_found_money helpers', () => {
  it('secondsSince floors at zero', () => {
    expect(secondsSince(1_000, 1_500)).toBe(1);
    expect(secondsSince(2_000, 1_000)).toBe(0);
    expect(secondsSince(null)).toBeNull();
  });

  it('builds analytics props', () => {
    expect(timeToFoundMoneyProps(1_000, 'demo', 4_500)).toEqual({
      seconds: 4,
      source: 'demo',
    });
    expect(timeToFoundMoneyProps(null, 'manual')).toBeNull();
  });

  it('skipPathSecondsProps always includes seconds (W008)', () => {
    expect(skipPathSecondsProps(1_000, 13_000)).toEqual({ seconds: 12 });
    expect(skipPathSecondsProps(null)).toEqual({ seconds: 0 });
  });

  it('demoExitedProps includes seconds and demo source (W001)', () => {
    expect(demoExitedProps(1_000, 4_000)).toEqual({ seconds: 3, source: 'demo' });
    expect(demoExitedProps(null)).toEqual({ seconds: 0, source: 'demo' });
  });
});
