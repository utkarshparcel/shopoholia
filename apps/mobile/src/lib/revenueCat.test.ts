import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canAccessClosetPremium,
  configureRevenueCat,
  isRevenueCatConfigured,
  paywallCopyFor,
  startLocalTrial,
  __resetRevenueCatForTests,
} from './revenueCat';

const ENV_KEYS = [
  'EXPO_PUBLIC_FEATURE_PREMIUM_GATES',
  'EXPO_PUBLIC_FEATURE_REVENUECAT',
  'EXPO_PUBLIC_REVENUECAT_API_KEY',
  'EXPO_PUBLIC_EXPERIMENT_UPI_CHECKOUT',
  'EXPO_PUBLIC_FEATURE_UPI',
  'EXPO_PUBLIC_WORN_REGION',
] as const;

const originals: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

describe('revenueCat paywall gate', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      originals[k] = process.env[k];
      delete process.env[k];
    }
    __resetRevenueCatForTests();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originals[k] === undefined) delete process.env[k];
      else process.env[k] = originals[k];
    }
    __resetRevenueCatForTests();
  });

  it('allows accountant when gates off', () => {
    expect(canAccessClosetPremium('accountant')).toBe(true);
  });

  it('blocks then unlocks after local trial when gates on', () => {
    process.env.EXPO_PUBLIC_FEATURE_PREMIUM_GATES = '1';
    expect(canAccessClosetPremium('accountant')).toBe(false);
    startLocalTrial('00000000-0000-4000-8000-000000000020', 'closet_premium_monthly');
    expect(canAccessClosetPremium('accountant')).toBe(true);
    expect(canAccessClosetPremium('outfits')).toBe(true);
    expect(paywallCopyFor('accountant').trialDays).toBe(7);
  });

  it('configure is no-op without API key', async () => {
    process.env.EXPO_PUBLIC_FEATURE_REVENUECAT = '1';
    expect(isRevenueCatConfigured()).toBe(false);
    expect(await configureRevenueCat('user-1')).toEqual({ configured: false });
  });
});
