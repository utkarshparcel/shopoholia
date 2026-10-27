import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canAccessClosetPremium,
  getLocalEntitlements,
  paywallCopyFor,
  startLocalTrial,
  __resetLocalTrialForTests,
} from './premiumAccess';

const USER_ID = '00000000-0000-4000-8000-000000000020';
const GATES = 'EXPO_PUBLIC_FEATURE_PREMIUM_GATES';
const dev = globalThis as { __DEV__?: boolean };

describe('premium access gate', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[GATES];
    delete process.env[GATES];
    dev.__DEV__ = true;
    __resetLocalTrialForTests();
  });

  afterEach(() => {
    if (original === undefined) delete process.env[GATES];
    else process.env[GATES] = original;
    dev.__DEV__ = true;
    __resetLocalTrialForTests();
  });

  it('allows every surface when gates are off', () => {
    expect(canAccessClosetPremium('accountant')).toBe(true);
  });

  it('unlocks from the server snapshot only when it grants the surface', () => {
    process.env[GATES] = '1';
    expect(canAccessClosetPremium('accountant')).toBe(false);
    expect(canAccessClosetPremium('accountant', { grants: [] })).toBe(false);
  });

  it('unlocks after a local trial in a development build', () => {
    process.env[GATES] = '1';
    expect(startLocalTrial(USER_ID, 'closet_premium_monthly')).not.toBeNull();
    expect(canAccessClosetPremium('accountant')).toBe(true);
    expect(canAccessClosetPremium('outfits')).toBe(true);
    expect(paywallCopyFor('accountant').trialDays).toBe(7);
  });

  it('grants nothing locally in a release build', () => {
    process.env[GATES] = '1';
    dev.__DEV__ = false;
    expect(startLocalTrial(USER_ID, 'closet_premium_monthly')).toBeNull();
    expect(getLocalEntitlements()).toBeNull();
    expect(canAccessClosetPremium('accountant')).toBe(false);
  });

  it('ignores a trial started earlier once the build is not a development build', () => {
    process.env[GATES] = '1';
    startLocalTrial(USER_ID, 'closet_premium_monthly');
    dev.__DEV__ = false;
    expect(canAccessClosetPremium('accountant')).toBe(false);
  });
});
