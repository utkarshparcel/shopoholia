import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Api from './api';
import { PurchaseApiError, type CoinPacksOffer } from './api';
import { createFakePurchasesClient } from './fakePurchasesClient';
import { createPurchaseQueue, type ConfirmResult, type UnconfirmedPurchase } from './queue';
import type { PurchasesClient } from './types';
import { loadShop, noticeForResult, useCoinShop } from './useCoinShop';

const USER = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  fetchCoinPacks: vi.fn(),
  validateCoins: vi.fn(),
  client: null as unknown,
  queue: null as unknown,
}));

vi.mock('@/src/api/client', () => ({ API_URL: 'http://api.test', refreshSession: vi.fn() }));
vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string }) => unknown) => sel({ accessToken: 'token' }),
}));
vi.mock('@/src/lib/access-token', () => ({ userIdFromAccessToken: (t: string | null) => (t ? USER : null) }));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  fetchCoinPacks: mocks.fetchCoinPacks,
}));
vi.mock('./purchases', () => ({
  getPurchasesClient: () => mocks.client,
  get purchaseQueue() {
    return mocks.queue;
  },
}));

const offer = (over: Partial<CoinPacksOffer> = {}): CoinPacksOffer => ({
  purchasesAvailable: true,
  stores: { app_store: true, play_store: true },
  packs: [
    { id: 'coins_small', storeProductId: 'worn.coins.100', coins: 100 },
    { id: 'coins_medium', storeProductId: 'worn.coins.350', coins: 350, popular: true },
  ],
  ...over,
});

const storePrices = [
  { storeProductId: 'worn.coins.100', priceString: '₹99.00', price: 99, currency: 'INR' },
  { storeProductId: 'worn.coins.350', priceString: '₹299.00', price: 299, currency: 'INR' },
];

const purchased = (transactionId: string) => async () => ({
  status: 'purchased' as const,
  transaction: { store: 'app_store' as const, productId: 'worn.coins.350', transactionId, proof: 'jws' },
});

function newQueue() {
  return createPurchaseQueue({
    storage: (() => {
      const data = new Map<string, string>();
      return { getItem: async (k: string) => data.get(k) ?? null, setItem: async (k: string, v: string) => void data.set(k, v) };
    })(),
    validateCoins: mocks.validateCoins,
    syncSubscription: vi.fn(),
    // As in purchases.ts: the queue finishes through the device's client.
    finish: async (transaction, kind) => {
      await (mocks.client as PurchasesClient | null)?.finish(transaction, kind);
    },
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const entry = { store: 'app_store', productId: 'worn.coins.350', transactionId: 't', proof: 'jws', userId: USER, kind: 'coins', addedAt: 0, attempts: 0 } as UnconfirmedPurchase;

beforeEach(() => {
  mocks.fetchCoinPacks.mockReset().mockResolvedValue(offer());
  mocks.validateCoins.mockReset().mockResolvedValue({ coinsGranted: 350, balanceAfter: 400, alreadyGranted: false, refunded: false });
  mocks.queue = newQueue();
});

afterEach(() => {
  mocks.client = null;
});

describe('loadShop', () => {
  it('shows each pack with the store\'s localized price', async () => {
    const client = createFakePurchasesClient({ products: storePrices });
    const shop = await loadShop(client);
    expect(shop).toEqual({
      status: 'ready',
      packs: [
        expect.objectContaining({ id: 'coins_small', coins: 100, priceString: '₹99.00', sample: false }),
        expect.objectContaining({ id: 'coins_medium', coins: 350, priceString: '₹299.00', popular: true }),
      ],
    });
  });

  it('hides a pack the store doesn\'t sell', async () => {
    const client = createFakePurchasesClient({ products: storePrices.slice(1) });
    const shop = await loadShop(client);
    expect(shop.status === 'ready' && shop.packs.map((p) => p.id)).toEqual(['coins_medium']);
  });

  it('never shows a sample price from a real store client', async () => {
    const client = createFakePurchasesClient({
      kind: 'store',
      products: storePrices.map((p) => ({ ...p, sample: true })),
    });
    expect(await loadShop(client)).toEqual({ status: 'ready', packs: [] });
  });

  it('shows sample prices only from the dev client', async () => {
    const client = createFakePurchasesClient({ kind: 'dev', products: storePrices.map((p) => ({ ...p, sample: true })) });
    const shop = await loadShop(client);
    expect(shop.status === 'ready' && shop.packs.every((p) => p.sample)).toBe(true);
  });

  it('is unavailable when the server can\'t verify this store', async () => {
    mocks.fetchCoinPacks.mockResolvedValue(offer({ stores: { app_store: false, play_store: true } }));
    const client = createFakePurchasesClient({ store: 'app_store', products: storePrices });
    expect(await loadShop(client)).toEqual({ status: 'unavailable' });
  });

  it('is unavailable on a 503', async () => {
    mocks.fetchCoinPacks.mockRejectedValue(new PurchaseApiError('unavailable', 503));
    expect(await loadShop(createFakePurchasesClient())).toEqual({ status: 'unavailable' });
  });
});

describe('noticeForResult', () => {
  const coins = { coinsGranted: 350, balanceAfter: 400, alreadyGranted: false, refunded: false };
  it.each<[ConfirmResult, ReturnType<typeof noticeForResult>]>([
    [{ status: 'confirmed', entry, coins }, { kind: 'added', coins: 350, balanceAfter: 400 }],
    [{ status: 'confirmed', entry, coins: { ...coins, alreadyGranted: true } }, { kind: 'added', coins: 350, balanceAfter: 400 }],
    [{ status: 'confirmed', entry, coins: { ...coins, refunded: true } }, null],
    [{ status: 'waiting', entry, reason: 'pending' }, { kind: 'pending' }],
    [{ status: 'waiting', entry, reason: 'unavailable' }, { kind: 'confirming' }],
    [{ status: 'waiting', entry, reason: 'retry' }, { kind: 'confirming' }],
    [{ status: 'conflict', entry }, { kind: 'conflict' }],
    [{ status: 'refunded', entry }, { kind: 'refunded' }],
    [{ status: 'rejected', entry, httpStatus: 400, code: 'invalid_proof' }, { kind: 'rejected' }],
  ])('%#', (result, notice) => {
    expect(noticeForResult(result)).toEqual(notice);
  });
});

describe('useCoinShop', () => {
  it('says there is no store on a device without billing', async () => {
    mocks.client = null;
    const { result } = renderHook(() => useCoinShop(), { wrapper });
    expect(result.current.view).toEqual({ status: 'no_store' });
  });

  it('adds coins only after the server confirms', async () => {
    let answer: (v: unknown) => void = () => undefined;
    mocks.validateCoins.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const client = createFakePurchasesClient({ products: storePrices, purchase: purchased('2000000001') });
    mocks.client = client;
    const { result } = renderHook(() => useCoinShop(), { wrapper });
    await waitFor(() => expect(result.current.view.status).toBe('ready'));
    const pack = result.current.view.status === 'ready' ? result.current.view.packs[1] : null;

    let bought: Promise<void> = Promise.resolve();
    act(() => {
      bought = result.current.buy(pack!);
    });
    await waitFor(() => expect(mocks.validateCoins).toHaveBeenCalled());
    expect(result.current.notice).toBeNull();
    expect(client.calls.configure).toEqual([USER]);

    await act(async () => {
      answer({ coinsGranted: 350, balanceAfter: 400, alreadyGranted: false, refunded: false });
      await bought;
    });
    expect(result.current.notice).toEqual({ kind: 'added', coins: 350, balanceAfter: 400 });
    expect(client.calls.finish).toHaveLength(1);
  });

  it('says nothing when the purchase is cancelled', async () => {
    const client = createFakePurchasesClient({ products: storePrices, purchase: async () => ({ status: 'cancelled' }) });
    mocks.client = client;
    const { result } = renderHook(() => useCoinShop(), { wrapper });
    await waitFor(() => expect(result.current.view.status).toBe('ready'));

    await act(async () => {
      if (result.current.view.status === 'ready') await result.current.buy(result.current.view.packs[0]);
    });

    expect(result.current.notice).toBeNull();
    expect(mocks.validateCoins).not.toHaveBeenCalled();
    expect(await (mocks.queue as ReturnType<typeof newQueue>).list()).toEqual([]);
  });

  it('waits for approval on a pending purchase', async () => {
    mocks.client = createFakePurchasesClient({ products: storePrices, purchase: async () => ({ status: 'pending' }) });
    const { result } = renderHook(() => useCoinShop(), { wrapper });
    await waitFor(() => expect(result.current.view.status).toBe('ready'));
    await act(async () => {
      if (result.current.view.status === 'ready') await result.current.buy(result.current.view.packs[0]);
    });
    expect(result.current.notice).toEqual({ kind: 'pending' });
  });

  it('keeps a paid purchase the server couldn\'t confirm and marks its pack', async () => {
    mocks.validateCoins.mockRejectedValue(new PurchaseApiError('retry', null));
    const client = createFakePurchasesClient({ products: storePrices, purchase: purchased('2000000002') });
    mocks.client = client;
    const { result } = renderHook(() => useCoinShop(), { wrapper });
    await waitFor(() => expect(result.current.view.status).toBe('ready'));

    await act(async () => {
      if (result.current.view.status === 'ready') await result.current.buy(result.current.view.packs[1]);
    });

    expect(result.current.notice).toEqual({ kind: 'confirming' });
    expect(client.calls.finish).toEqual([]);
    await waitFor(() => expect(result.current.confirmingProductIds).toEqual(['worn.coins.350']));

    // Check again confirms it.
    mocks.validateCoins.mockResolvedValue({ coinsGranted: 350, balanceAfter: 400, alreadyGranted: false, refunded: false });
    act(() => result.current.checkAgain());
    await waitFor(() => expect(result.current.notice).toEqual({ kind: 'added', coins: 350, balanceAfter: 400 }));
    await waitFor(() => expect(result.current.confirmingProductIds).toEqual([]));
    expect(client.calls.finish).toHaveLength(1);
  });

  it('shows the conflict when the purchase belongs to another account', async () => {
    mocks.validateCoins.mockRejectedValue(new PurchaseApiError('conflict', 409, 'purchase_belongs_to_another_account'));
    mocks.client = createFakePurchasesClient({ products: storePrices, purchase: purchased('2000000003') });
    const { result } = renderHook(() => useCoinShop(), { wrapper });
    await waitFor(() => expect(result.current.view.status).toBe('ready'));
    await act(async () => {
      if (result.current.view.status === 'ready') await result.current.buy(result.current.view.packs[1]);
    });
    expect(result.current.notice).toEqual({ kind: 'conflict' });
  });

  it('reports a store error as failed', async () => {
    mocks.client = createFakePurchasesClient({
      products: storePrices,
      purchase: () => Promise.reject(new Error('E_BILLING_6')),
    });
    const { result } = renderHook(() => useCoinShop(), { wrapper });
    await waitFor(() => expect(result.current.view.status).toBe('ready'));
    await act(async () => {
      if (result.current.view.status === 'ready') await result.current.buy(result.current.view.packs[0]);
    });
    expect(result.current.notice).toEqual({ kind: 'failed' });
  });
});
