import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  failureFor,
  fetchCoinPacks,
  PurchaseApiError,
  storeAvailable,
  syncSubscriptionPurchase,
  validateCoinPurchase,
} from './api';
import type { StoreTransaction } from './types';

const mocks = vi.hoisted(() => ({
  refreshSession: vi.fn(async (): Promise<string | null> => null),
  session: { accessToken: 'token-1' as string | null },
}));

vi.mock('@/src/api/client', () => ({ API_URL: 'http://api.test', refreshSession: mocks.refreshSession }));
vi.mock('@/src/stores/session', () => ({ useSessionStore: { getState: () => mocks.session } }));

const iosCoins: StoreTransaction = {
  store: 'app_store',
  productId: 'worn.coins.350',
  transactionId: '2000000123456789',
  proof: 'eyJhbGciOiJFUzI1NiJ9.payload.sig',
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  mocks.session.accessToken = 'token-1';
  mocks.refreshSession.mockReset().mockResolvedValue(null);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as Record<string, unknown>;
}

async function failureOf(promise: Promise<unknown>): Promise<PurchaseApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PurchaseApiError);
  return error as PurchaseApiError;
}

describe('failureFor', () => {
  it('maps the contract\'s answers', () => {
    expect(failureFor(409, 'purchase_belongs_to_another_account')).toBe('conflict');
    expect(failureFor(402, 'purchase_refunded')).toBe('refunded');
    expect(failureFor(402, 'purchase_pending')).toBe('pending');
    expect(failureFor(402, 'purchase_not_found')).toBe('rejected');
    expect(failureFor(402, 'subscription_inactive')).toBe('rejected');
    expect(failureFor(400, 'invalid_proof')).toBe('rejected');
    expect(failureFor(503, 'iap_unavailable')).toBe('unavailable');
    expect(failureFor(500)).toBe('unavailable');
    expect(failureFor(401)).toBe('retry');
    expect(failureFor(429)).toBe('retry');
  });
});

describe('validateCoinPurchase', () => {
  it('sends the StoreKit jws with the store transaction', async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, coinsGranted: 350, balanceAfter: 400 }));

    await expect(validateCoinPurchase(iosCoins)).resolves.toEqual({
      coinsGranted: 350,
      balanceAfter: 400,
      alreadyGranted: false,
      refunded: false,
    });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/coins/iap/validate');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer token-1' });
    expect(sentBody()).toEqual({
      productId: 'worn.coins.350',
      store: 'app_store',
      transactionId: '2000000123456789',
      jws: iosCoins.proof,
    });
  });

  it('sends the Play purchase token', async () => {
    fetchMock.mockResolvedValue(json(200, { coinsGranted: 100, balanceAfter: 100, alreadyGranted: true }));
    const result = await validateCoinPurchase({
      store: 'play_store',
      productId: 'worn.coins.100',
      transactionId: 'GPA.3312-4521-0098-12345',
      proof: 'play-token',
    });
    expect(result.alreadyGranted).toBe(true);
    expect(sentBody()).toEqual({
      productId: 'worn.coins.100',
      store: 'play_store',
      transactionId: 'GPA.3312-4521-0098-12345',
      purchaseToken: 'play-token',
    });
  });

  it('sends no proof for a simulated transaction', async () => {
    fetchMock.mockResolvedValue(json(200, { coinsGranted: 350, balanceAfter: 350 }));
    await validateCoinPurchase({ ...iosCoins, transactionId: 'simulated-1', proof: null });
    expect(sentBody()).not.toHaveProperty('jws');
    expect(sentBody()).not.toHaveProperty('purchaseToken');
  });

  it('reads the error code from the body', async () => {
    fetchMock.mockResolvedValue(json(409, { error: 'purchase_belongs_to_another_account' }));
    const error = await failureOf(validateCoinPurchase(iosCoins));
    expect(error).toMatchObject({ failure: 'conflict', status: 409, code: 'purchase_belongs_to_another_account' });
  });

  it('reads a 429\'s retry-after', async () => {
    fetchMock.mockResolvedValue(json(429, { error: 'rate_limited' }, { 'retry-after': '30' }));
    const error = await failureOf(validateCoinPurchase(iosCoins));
    expect(error).toMatchObject({ failure: 'retry', status: 429, retryAfterMs: 30_000 });
  });

  it('keeps a 503 with no body as unavailable', async () => {
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));
    const error = await failureOf(validateCoinPurchase(iosCoins));
    expect(error).toMatchObject({ failure: 'unavailable', status: 503, code: null });
  });

  it('turns a network error into retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const error = await failureOf(validateCoinPurchase(iosCoins));
    expect(error).toMatchObject({ failure: 'retry', status: null });
  });

  it('retries a 200 without coin numbers rather than trusting it', async () => {
    fetchMock.mockResolvedValue(json(200, { success: true }));
    const error = await failureOf(validateCoinPurchase(iosCoins));
    expect(error.failure).toBe('retry');
  });

  it('renews the session once on a 401', async () => {
    mocks.refreshSession.mockResolvedValue('token-2');
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'unauthorized' }))
      .mockResolvedValueOnce(json(200, { coinsGranted: 350, balanceAfter: 400 }));

    await validateCoinPurchase(iosCoins);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer token-2' });
  });

  it('waits for sign-in when there is no session', async () => {
    mocks.session.accessToken = null;
    const error = await failureOf(validateCoinPurchase(iosCoins));
    expect(error.failure).toBe('retry');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('syncSubscriptionPurchase', () => {
  it('sends the Closet product id, not the store\'s', async () => {
    fetchMock.mockResolvedValue(json(200, { snapshot: { grants: [] } }));
    await syncSubscriptionPurchase({
      store: 'app_store',
      productId: 'worn.closet.premium.monthly',
      transactionId: '2000000999',
      proof: 'jws-sub',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/entitlements/sync');
    expect(sentBody()).toEqual({ productId: 'closet_premium_monthly', store: 'app_store', jws: 'jws-sub' });
  });

  it('rejects an inactive subscription', async () => {
    fetchMock.mockResolvedValue(json(402, { error: 'subscription_inactive' }));
    const error = await failureOf(
      syncSubscriptionPurchase({
        store: 'play_store',
        productId: 'worn.closet.premium.monthly',
        transactionId: 'GPA.1',
        proof: 'play-token',
      }),
    );
    expect(error).toMatchObject({ failure: 'rejected', code: 'subscription_inactive' });
  });
});

describe('fetchCoinPacks', () => {
  it('reads per-store availability and drops malformed packs', async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        purchasesAvailable: true,
        stores: { app_store: true, play_store: false },
        packs: [
          { id: 'coins_medium', storeProductId: 'worn.coins.350', coins: 350, popular: true },
          { id: 'coins_bad', coins: 10 },
          { id: 'coins_zero', storeProductId: 'worn.coins.0', coins: 0 },
        ],
      }),
    );

    const offer = await fetchCoinPacks();

    expect(offer.stores).toEqual({ app_store: true, play_store: false });
    expect(offer.packs.map((p) => p.id)).toEqual(['coins_medium']);
    expect(storeAvailable(offer, 'app_store')).toBe(true);
    expect(storeAvailable(offer, 'play_store')).toBe(false);
  });

  it('falls back to purchasesAvailable without stores', async () => {
    fetchMock.mockResolvedValue(json(200, { purchasesAvailable: false, packs: [] }));
    const offer = await fetchCoinPacks();
    expect(offer.stores).toBeNull();
    expect(storeAvailable(offer, 'app_store')).toBe(false);
  });

  it('reports a 503 as unavailable', async () => {
    fetchMock.mockResolvedValue(json(503, { error: 'iap_unavailable' }));
    const error = await failureOf(fetchCoinPacks());
    expect(error.failure).toBe('unavailable');
  });
});
