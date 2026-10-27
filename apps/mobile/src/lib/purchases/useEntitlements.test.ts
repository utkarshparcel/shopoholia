import { describe, expect, it, vi } from 'vitest';

import type { UnconfirmedPurchase } from './queue';
import { premiumNoticeFor, subscriptionsAvailable } from './useEntitlements';

vi.mock('@/src/api/client', () => ({
  API_URL: 'http://api.test',
  refreshSession: vi.fn(),
  fetchEntitlementOfferings: vi.fn(),
}));
// No native module in tests, as on web.
vi.mock('@/modules/worn-iap', () => ({ default: null }));

const entry = {
  store: 'app_store',
  productId: 'worn.closet.premium.monthly',
  transactionId: '2000000001',
  proof: 'jws',
  userId: 'u',
  kind: 'subscription',
  addedAt: 0,
  attempts: 0,
} as UnconfirmedPurchase;

type Offerings = Parameters<typeof subscriptionsAvailable>[0];
const offerings = (over: Record<string, unknown>) => ({ offerings: [], ...over }) as unknown as Offerings;

describe('premiumNoticeFor', () => {
  it('unlocks only on the server\'s confirmation', () => {
    expect(premiumNoticeFor({ status: 'confirmed', entry })).toEqual({ kind: 'active' });
    expect(premiumNoticeFor({ status: 'waiting', entry, reason: 'unavailable' })).toEqual({ kind: 'confirming' });
    expect(premiumNoticeFor({ status: 'waiting', entry, reason: 'pending' })).toEqual({ kind: 'pending' });
  });

  it('tells an inactive subscription from other rejections', () => {
    expect(premiumNoticeFor({ status: 'rejected', entry, httpStatus: 402, code: 'subscription_inactive' })).toEqual({
      kind: 'inactive',
    });
    expect(premiumNoticeFor({ status: 'rejected', entry, httpStatus: 400, code: 'invalid_proof' })).toEqual({
      kind: 'rejected',
    });
    expect(premiumNoticeFor({ status: 'conflict', entry })).toEqual({ kind: 'conflict' });
    expect(premiumNoticeFor({ status: 'refunded', entry })).toEqual({ kind: 'refunded' });
  });
});

describe('subscriptionsAvailable', () => {
  it('needs offerings from a store provider', () => {
    expect(subscriptionsAvailable(null, 'app_store')).toBe(false);
    expect(subscriptionsAvailable(offerings({ provider: 'none' }), 'app_store')).toBe(false);
    expect(subscriptionsAvailable(offerings({ provider: 'store' }), 'app_store')).toBe(true);
  });

  it('refuses an older server that can\'t verify store subscriptions', () => {
    expect(subscriptionsAvailable(offerings({ provider: 'upi' }), 'app_store')).toBe(false);
    expect(subscriptionsAvailable(offerings({ provider: 'revenuecat' }), 'play_store')).toBe(false);
  });

  it('follows the per-store switch', () => {
    const split = offerings({ provider: 'store', stores: { app_store: true, play_store: false } });
    expect(subscriptionsAvailable(split, 'app_store')).toBe(true);
    expect(subscriptionsAvailable(split, 'play_store')).toBe(false);
  });
});
