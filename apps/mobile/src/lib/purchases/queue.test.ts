import type { EntitlementSnapshot } from '@worn/shared';
import { describe, expect, it, vi } from 'vitest';

import { PurchaseApiError, type CoinsConfirmed } from './api';
import {
  createPurchaseQueue,
  PURCHASE_QUEUE_KEY,
  retryDelayMs,
  type QueueStorage,
  type UnconfirmedPurchase,
} from './queue';
import type { StoreTransaction } from './types';

vi.mock('@/src/api/client', () => ({ API_URL: 'http://api.test', refreshSession: vi.fn() }));

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';

const purchase = (over: Partial<StoreTransaction> = {}): StoreTransaction => ({
  store: 'app_store',
  productId: 'worn.coins.350',
  transactionId: '2000000123456789',
  proof: 'jws-1',
  ...over,
});

const granted: CoinsConfirmed = { coinsGranted: 350, balanceAfter: 400, alreadyGranted: false, refunded: false };
const snapshot = { grants: [] } as unknown as EntitlementSnapshot;

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PURCHASE_QUEUE_KEY, initial);
  const storage: QueueStorage & { data: Map<string, string> } = {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
  };
  return storage;
}

function saved(storage: { data: Map<string, string> }): UnconfirmedPurchase[] {
  return JSON.parse(storage.data.get(PURCHASE_QUEUE_KEY) ?? '[]') as UnconfirmedPurchase[];
}

function setup() {
  const storage = memoryStorage();
  let clock = 1_000_000;
  const deps = {
    storage,
    validateCoins: vi.fn(async (_t: StoreTransaction) => granted),
    syncSubscription: vi.fn(async (_t: StoreTransaction) => snapshot),
    finish: vi.fn(async (_t: StoreTransaction, _kind: string) => undefined),
    now: () => clock,
  };
  const queue = createPurchaseQueue(deps);
  return { queue, deps, storage, advance: (ms: number) => (clock += ms), now: () => clock };
}

describe('purchase queue', () => {
  it('saves a transaction before it is sent', async () => {
    const { queue, deps, storage } = setup();
    let savedWhenSent: UnconfirmedPurchase[] = [];
    deps.validateCoins.mockImplementation(async () => {
      savedWhenSent = saved(storage);
      return granted;
    });

    const entry = await queue.add(purchase(), USER, 'coins');
    await queue.confirm(entry);

    expect(savedWhenSent).toHaveLength(1);
    expect(savedWhenSent[0]).toMatchObject({ transactionId: '2000000123456789', userId: USER, attempts: 0 });
  });

  it('stores the same transaction once and keeps the store\'s latest proof', async () => {
    const { queue } = setup();
    await queue.add(purchase(), USER, 'coins');
    await queue.add(purchase(), USER, 'coins');
    await queue.add(purchase({ proof: 'jws-2' }), USER, 'coins');
    await queue.add(purchase({ proof: null }), USER, 'coins');

    const entries = await queue.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].proof).toBe('jws-2');
  });

  it('keeps the same transaction id from the other store apart', async () => {
    const { queue } = setup();
    await queue.add(purchase(), USER, 'coins');
    await queue.add(purchase({ store: 'play_store', proof: 'token' }), USER, 'coins');
    expect(await queue.list()).toHaveLength(2);
  });

  it('finishes and removes the transaction on a 200', async () => {
    const { queue, deps, storage } = setup();
    const entry = await queue.add(purchase(), USER, 'coins');

    const result = await queue.confirm(entry);

    expect(result).toMatchObject({ status: 'confirmed', coins: granted });
    expect(deps.finish).toHaveBeenCalledWith(expect.objectContaining({ transactionId: '2000000123456789' }), 'coins');
    expect(saved(storage)).toEqual([]);
  });

  it('sends a subscription to entitlement sync, not coin validation', async () => {
    const { queue, deps } = setup();
    const entry = await queue.add(
      purchase({ productId: 'worn.closet.premium.monthly', transactionId: 'sub-1' }),
      USER,
      'subscription',
    );

    const result = await queue.confirm(entry);

    expect(result).toMatchObject({ status: 'confirmed', snapshot });
    expect(deps.validateCoins).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(expect.anything(), 'subscription');
  });

  it.each([
    ['conflict', new PurchaseApiError('conflict', 409, 'purchase_belongs_to_another_account')],
    ['refunded', new PurchaseApiError('refunded', 402, 'purchase_refunded')],
  ] as const)('finishes and drops a %s answer without retrying', async (status, error) => {
    const { queue, deps } = setup();
    deps.validateCoins.mockRejectedValue(error);
    const entry = await queue.add(purchase(), USER, 'coins');

    expect(await queue.confirm(entry)).toMatchObject({ status });
    expect(deps.finish).toHaveBeenCalledTimes(1);
    expect(await queue.list()).toEqual([]);
    expect(await queue.nextRetryDelay(USER)).toBeNull();
  });

  it.each([
    [400, 'invalid_proof'],
    [402, 'purchase_not_found'],
    [402, 'product_mismatch'],
    [402, 'subscription_inactive'],
  ])('finishes and drops a %i %s verdict with its status and code', async (httpStatus, code) => {
    const { queue, deps } = setup();
    deps.validateCoins.mockRejectedValue(new PurchaseApiError('rejected', httpStatus, code));
    const entry = await queue.add(purchase(), USER, 'coins');

    expect(await queue.confirm(entry)).toEqual({ status: 'rejected', entry, httpStatus, code });
    expect(deps.finish).toHaveBeenCalledTimes(1);
    expect(await queue.list()).toEqual([]);
  });

  it.each([
    ['unavailable', new PurchaseApiError('unavailable', 503, 'iap_unavailable')],
    ['retry', new PurchaseApiError('retry', null)],
    ['retry', new TypeError('Network request failed')],
    ['pending', new PurchaseApiError('pending', 402, 'purchase_pending')],
  ] as const)('keeps a %s answer unfinished and counts the attempt', async (reason, error) => {
    const { queue, deps, storage } = setup();
    deps.validateCoins.mockRejectedValue(error);
    const entry = await queue.add(purchase(), USER, 'coins');

    const result = await queue.confirm(entry);

    expect(result).toMatchObject({ status: 'waiting', reason, entry: { attempts: 1, lastFailure: reason } });
    expect(deps.finish).not.toHaveBeenCalled();
    expect(saved(storage)).toEqual([expect.objectContaining({ attempts: 1, lastFailure: reason })]);
  });

  it('confirms a transaction saved offline on the next drain, and credits it once', async () => {
    const { queue, deps } = setup();
    deps.validateCoins.mockRejectedValueOnce(new PurchaseApiError('retry', null));
    const entry = await queue.add(purchase(), USER, 'coins');
    await queue.confirm(entry);

    const results = await queue.drain(USER);
    expect(results).toEqual([expect.objectContaining({ status: 'confirmed' })]);
    expect(await queue.drain(USER)).toEqual([]);
    expect(deps.validateCoins).toHaveBeenCalledTimes(2);
    expect(deps.finish).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent confirms of the same transaction', async () => {
    const { queue, deps } = setup();
    let answer: (value: CoinsConfirmed) => void = () => undefined;
    deps.validateCoins.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const entry = await queue.add(purchase(), USER, 'coins');

    const first = queue.confirm(entry);
    const second = queue.confirm(entry);
    await vi.waitFor(() => expect(deps.validateCoins).toHaveBeenCalled());
    answer(granted);

    expect(await first).toBe(await second);
    expect(deps.validateCoins).toHaveBeenCalledTimes(1);
  });

  it('drains only the signed-in user\'s purchases, one drain at a time', async () => {
    const { queue, deps } = setup();
    await queue.add(purchase({ transactionId: 'mine' }), USER, 'coins');
    await queue.add(purchase({ transactionId: 'theirs' }), OTHER_USER, 'coins');

    const [a, b] = await Promise.all([queue.drain(USER), queue.drain(USER)]);

    expect(a).toBe(b);
    expect(deps.validateCoins).toHaveBeenCalledTimes(1);
    expect(deps.validateCoins).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'mine' }));
    expect(await queue.list(OTHER_USER)).toHaveLength(1);
  });

  it('tells listeners about background results', async () => {
    const { queue } = setup();
    const listener = vi.fn();
    const stop = queue.onResult(listener);
    await queue.add(purchase(), USER, 'coins');
    await queue.drain(USER);
    stop();
    await queue.add(purchase({ transactionId: 'later' }), USER, 'coins');
    await queue.drain(USER);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
  });

  it('reads saved entries after a restart and skips corrupt ones', async () => {
    const good: UnconfirmedPurchase = { ...purchase(), userId: USER, kind: 'coins', addedAt: 1, attempts: 2 };
    const storage = memoryStorage(JSON.stringify([good, { store: 'web', transactionId: 1 }, null]));
    const queue = createPurchaseQueue({
      storage,
      validateCoins: vi.fn(async () => granted),
      syncSubscription: vi.fn(async () => snapshot),
      finish: vi.fn(async () => undefined),
    });

    expect(await queue.list(USER)).toEqual([good]);
  });

  it('starts empty when storage holds garbage or can\'t be read', async () => {
    const garbage = createPurchaseQueue({
      storage: memoryStorage('{not json'),
      validateCoins: vi.fn(),
      syncSubscription: vi.fn(),
      finish: vi.fn(),
    });
    const broken = createPurchaseQueue({
      storage: { getItem: () => Promise.reject(new Error('disk')), setItem: async () => undefined },
      validateCoins: vi.fn(),
      syncSubscription: vi.fn(),
      finish: vi.fn(),
    });
    expect(await garbage.list()).toEqual([]);
    expect(await broken.list()).toEqual([]);
  });

  it('backs off from 5 s, doubling, and waits for a 429\'s retry-after', async () => {
    const { queue, deps, advance } = setup();
    deps.validateCoins.mockRejectedValue(new PurchaseApiError('unavailable', 503));
    const entry = await queue.add(purchase(), USER, 'coins');
    expect(await queue.nextRetryDelay(USER)).toBe(0);

    await queue.confirm(entry);
    expect(await queue.nextRetryDelay(USER)).toBe(5_000);
    await queue.drain(USER);
    expect(await queue.nextRetryDelay(USER)).toBe(10_000);

    deps.validateCoins.mockRejectedValue(new PurchaseApiError('retry', 429, 'rate_limited', 60_000));
    await queue.drain(USER);
    expect(await queue.nextRetryDelay(USER)).toBe(60_000);
    advance(50_000);
    expect(await queue.nextRetryDelay(USER)).toBe(20_000);

    // The next answer without retry-after clears the old wait.
    deps.validateCoins.mockRejectedValue(new PurchaseApiError('unavailable', 503));
    await queue.drain(USER);
    expect((await queue.list(USER))[0].notBefore).toBeUndefined();
  });

  it('waits for the store on a pending purchase', async () => {
    const { queue, deps } = setup();
    deps.validateCoins.mockRejectedValue(new PurchaseApiError('pending', 402, 'purchase_pending'));
    await queue.confirm(await queue.add(purchase(), USER, 'coins'));
    expect(await queue.nextRetryDelay(USER)).toBeNull();
  });
});

describe('retryDelayMs', () => {
  it('sends a new entry now', () => {
    expect(retryDelayMs({ attempts: 0 })).toBe(0);
  });

  it('caps the backoff at 5 minutes', () => {
    expect(retryDelayMs({ attempts: 1, lastFailure: 'retry' }, 0)).toBe(5_000);
    expect(retryDelayMs({ attempts: 4, lastFailure: 'unavailable' }, 0)).toBe(40_000);
    expect(retryDelayMs({ attempts: 30, lastFailure: 'retry' }, 0)).toBe(300_000);
  });

  it('never retries before notBefore', () => {
    expect(retryDelayMs({ attempts: 1, lastFailure: 'retry', notBefore: 120_000 }, 0)).toBe(120_000);
    expect(retryDelayMs({ attempts: 1, lastFailure: 'retry', notBefore: 1_000 }, 0)).toBe(5_000);
  });
});
