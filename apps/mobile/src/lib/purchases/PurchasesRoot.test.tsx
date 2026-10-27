import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PurchaseApiError } from './api';
import { createFakePurchasesClient } from './fakePurchasesClient';
import { PurchasesRoot } from './PurchasesRoot';
import { createPurchaseQueue } from './queue';
import type { PurchasesClient, StoreTransaction } from './types';

const USER = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  queue: null as unknown,
  validateCoins: vi.fn(),
  syncSubscription: vi.fn(),
  captureException: vi.fn(),
  trackEvent: vi.fn(),
  setCoinBalance: vi.fn(),
  session: { accessToken: 'token' as string | null },
  active: new Set<() => void>(),
  online: new Set<() => void>(),
}));

vi.mock('@/src/api/client', () => ({ API_URL: 'http://api.test', refreshSession: vi.fn() }));
vi.mock('@/src/lib/sentry', () => ({ captureException: mocks.captureException }));
vi.mock('@/src/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('@/src/hooks/orders', () => ({ orderKeys: { balance: (id: string | null) => ['coins', 'balance', id] } }));
vi.mock('@/src/lib/access-token', () => ({ userIdFromAccessToken: (t: string | null) => (t ? USER : null) }));
vi.mock('@/src/stores/session', () => ({
  useSessionStore: Object.assign(
    (sel: (s: { accessToken: string | null }) => unknown) => sel(mocks.session),
    { getState: () => ({ ...mocks.session, setCoinBalance: mocks.setCoinBalance }) },
  ),
}));
vi.mock('./appActive', () => ({
  onAppActive: (cb: () => void) => {
    mocks.active.add(cb);
    return () => mocks.active.delete(cb);
  },
  onNetworkRegained: (cb: () => void) => {
    mocks.online.add(cb);
    return () => mocks.online.delete(cb);
  },
}));
vi.mock('./DevPurchaseSheet', () => ({ DevPurchaseSheet: () => null }));
vi.mock('./purchases', () => ({
  getPurchasesClient: () => mocks.client,
  purchaseKindFor: (id: string) => (id.startsWith('worn.closet.') ? 'subscription' : 'coins'),
  get purchaseQueue() {
    return mocks.queue;
  },
}));

type FakeClient = ReturnType<typeof createFakePurchasesClient>;
type Queue = ReturnType<typeof createPurchaseQueue>;

const coins = (transactionId: string, proof = 'jws-secret'): StoreTransaction => ({
  store: 'app_store',
  productId: 'worn.coins.350',
  transactionId,
  proof,
});

const confirmed = { coinsGranted: 350, balanceAfter: 400, alreadyGranted: false, refunded: false };

let queryClient: QueryClient;

function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchasesRoot />
    </QueryClientProvider>,
  );
}

const fire = (listeners: Set<() => void>) => act(() => listeners.forEach((cb) => cb()));

beforeEach(() => {
  queryClient = new QueryClient();
  mocks.session.accessToken = 'token';
  mocks.validateCoins.mockReset().mockResolvedValue(confirmed);
  mocks.syncSubscription.mockReset();
  mocks.captureException.mockReset();
  mocks.trackEvent.mockReset();
  mocks.setCoinBalance.mockReset();
  mocks.client = createFakePurchasesClient();
  const data = new Map<string, string>();
  mocks.queue = createPurchaseQueue({
    storage: { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v) },
    validateCoins: mocks.validateCoins,
    syncSubscription: mocks.syncSubscription,
    finish: async (t, kind) => {
      await (mocks.client as PurchasesClient).finish(t, kind);
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const queue = () => mocks.queue as Queue;
const client = () => mocks.client as FakeClient;

describe('PurchasesRoot', () => {
  it('ties the store to the user and confirms purchases saved before the app closed', async () => {
    await queue().add(coins('2000000001'), USER, 'coins');

    mount();

    await waitFor(() => expect(client().calls.finish).toHaveLength(1));
    expect(client().calls.configure).toEqual([USER]);
    expect(queryClient.getQueryData(['coins', 'balance', USER])).toEqual({ balance: 400 });
    expect(mocks.setCoinBalance).toHaveBeenCalledWith(400);
    expect(mocks.trackEvent).toHaveBeenCalledWith('iap_purchase', { productId: 'worn.coins.350', coins: 350 });
  });

  it('confirms an unconfirmed purchase when the app comes back to the foreground', async () => {
    mocks.validateCoins.mockRejectedValueOnce(new PurchaseApiError('retry', null));
    await queue().add(coins('2000000002'), USER, 'coins');
    mount();
    await waitFor(() => expect(mocks.validateCoins).toHaveBeenCalledTimes(1));
    expect(mocks.setCoinBalance).not.toHaveBeenCalled();

    await fire(mocks.active);

    await waitFor(() => expect(mocks.setCoinBalance).toHaveBeenCalledWith(400));
    expect(client().calls.finish).toHaveLength(1);
    expect(await queue().list()).toEqual([]);
  });

  it('confirms when the network comes back', async () => {
    mocks.validateCoins.mockRejectedValueOnce(new PurchaseApiError('retry', null));
    await queue().add(coins('2000000003'), USER, 'coins');
    mount();
    await waitFor(() => expect(mocks.validateCoins).toHaveBeenCalledTimes(1));

    await fire(mocks.online);

    await waitFor(() => expect(client().calls.finish).toHaveLength(1));
  });

  it('retries with backoff while the app stays open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.validateCoins.mockRejectedValueOnce(new PurchaseApiError('unavailable', 503));
    await queue().add(coins('2000000004'), USER, 'coins');
    mount();
    await vi.waitFor(() => expect(mocks.validateCoins).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(mocks.validateCoins).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(1_500));

    await vi.waitFor(() => expect(client().calls.finish).toHaveLength(1));
    expect(mocks.validateCoins).toHaveBeenCalledTimes(2);
  });

  it('saves and confirms a transaction the store delivers later', async () => {
    mount();
    await waitFor(() => expect(client().calls.configure).toEqual([USER]));

    act(() => client().emit(coins('2000000005')));

    await waitFor(() => expect(client().calls.finish).toEqual([expect.objectContaining({ transactionId: '2000000005' })]));
  });

  it('credits a re-delivered transaction once', async () => {
    mocks.validateCoins.mockResolvedValueOnce(confirmed).mockResolvedValue({ ...confirmed, alreadyGranted: true });
    mount();
    await waitFor(() => expect(client().calls.configure).toEqual([USER]));

    act(() => client().emit(coins('2000000006')));
    await waitFor(() => expect(client().calls.finish).toHaveLength(1));
    act(() => client().emit(coins('2000000006')));
    await waitFor(() => expect(client().calls.finish).toHaveLength(2));

    expect(mocks.trackEvent.mock.calls.filter(([name]) => name === 'iap_purchase')).toHaveLength(1);
    expect(mocks.setCoinBalance).toHaveBeenLastCalledWith(400);
  });

  it('reports a rejected purchase without its proof', async () => {
    mocks.validateCoins.mockRejectedValue(new PurchaseApiError('rejected', 402, 'purchase_not_found'));
    await queue().add(coins('2000000007', 'jws-secret'), USER, 'coins');

    mount();

    await waitFor(() => expect(mocks.captureException).toHaveBeenCalledTimes(1));
    const tags = mocks.captureException.mock.calls[0][1] as Record<string, string>;
    expect(tags).toEqual({
      area: 'iap',
      store: 'app_store',
      productId: 'worn.coins.350',
      transactionId: '2000000007',
      kind: 'coins',
      status: '402',
      code: 'purchase_not_found',
    });
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toContain('jws-secret');
    expect(mocks.setCoinBalance).not.toHaveBeenCalled();
  });

  it('refreshes entitlements when the app comes back', async () => {
    mount();
    await waitFor(() => expect(client().calls.configure).toEqual([USER]));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await fire(mocks.active);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['entitlements', USER] });
  });

  it('does nothing while signed out', async () => {
    mocks.session.accessToken = null;
    await queue().add(coins('2000000008'), USER, 'coins');

    mount();
    await act(async () => undefined);

    expect(client().calls.configure).toEqual([]);
    expect(mocks.validateCoins).not.toHaveBeenCalled();
    expect(mocks.active.size).toBe(0);
  });
});
