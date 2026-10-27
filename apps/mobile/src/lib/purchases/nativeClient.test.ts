import { describe, expect, it, vi } from 'vitest';

import type { WornIapNativeModule, WornIapTransaction } from '@/modules/worn-iap';

import { createNativePurchasesClient } from './nativeClient';

vi.mock('expo-crypto', async () => {
  const { createHash } = await import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256' },
    digest: async () => new ArrayBuffer(20),
    digestStringAsync: async (_algorithm: string, data: string) => createHash('sha256').update(data).digest('hex'),
  };
});

const USER = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';

/** A stand-in for the WornIap Expo module (StoreKit 2 / Play Billing), driven by the test. */
function fakeNative() {
  const listeners = new Set<(t: WornIapTransaction) => void>();
  const native = {
    configure: vi.fn(async (_token: string, _account: string) => undefined),
    getProducts: vi.fn(async (_ids: string[], _subscriptionIds: string[]) => [
      { id: 'worn.coins.350', displayPrice: '₹299.00', price: 299, currencyCode: 'INR' },
    ]),
    purchase: vi.fn(async (_id: string, _subscription: boolean) => ({
      status: 'purchased' as const,
      transaction: { productId: 'worn.coins.350', transactionId: '2000000123', proof: 'jws' },
    })),
    finish: vi.fn(async (_id: string, _token: string, _consumable: boolean) => undefined),
    restore: vi.fn(async () => [
      { productId: 'worn.closet.premium.monthly', transactionId: '2000000456', proof: 'jws-sub' },
    ]),
    addListener: vi.fn((_event: 'onTransaction', listener: (t: WornIapTransaction) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
    emit: (t: WornIapTransaction) => listeners.forEach((l) => l(t)),
  };
  return native;
}

const asModule = (native: ReturnType<typeof fakeNative>) => native as unknown as WornIapNativeModule;

describe('native purchases client', () => {
  it('ties the store to the Worn account once per user', async () => {
    const native = fakeNative();
    const client = createNativePurchasesClient(asModule(native), 'app_store');

    await Promise.all([client.configure(USER), client.configure(USER)]);

    expect(native.configure).toHaveBeenCalledTimes(1);
    // The raw id never reaches Play: only its SHA-256 hex.
    expect(native.configure).toHaveBeenCalledWith(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
  });

  it('configures again after a failure', async () => {
    const native = fakeNative();
    native.configure.mockRejectedValueOnce(new Error('billing unavailable'));
    const client = createNativePurchasesClient(asModule(native), 'play_store');

    await expect(client.configure(USER)).rejects.toThrow('billing unavailable');
    await client.configure(USER);
    expect(native.configure).toHaveBeenCalledTimes(2);
  });

  it('asks the store for coin packs and subscriptions separately, with its localized prices', async () => {
    const native = fakeNative();
    const client = createNativePurchasesClient(asModule(native), 'app_store');

    const products = await client.getProducts(['worn.coins.350', 'worn.closet.premium.monthly']);

    expect(native.getProducts).toHaveBeenCalledWith(['worn.coins.350'], ['worn.closet.premium.monthly']);
    expect(products).toEqual([{ storeProductId: 'worn.coins.350', priceString: '₹299.00', price: 299, currency: 'INR' }]);
  });

  it('buys a coin pack as a one-time product and a plan as a subscription', async () => {
    const native = fakeNative();
    const client = createNativePurchasesClient(asModule(native), 'app_store');

    await expect(client.purchase('worn.coins.350')).resolves.toEqual({
      status: 'purchased',
      transaction: { store: 'app_store', productId: 'worn.coins.350', transactionId: '2000000123', proof: 'jws' },
    });
    await client.purchase('worn.closet.premium.monthly');

    expect(native.purchase).toHaveBeenNthCalledWith(1, 'worn.coins.350', false);
    expect(native.purchase).toHaveBeenNthCalledWith(2, 'worn.closet.premium.monthly', true);
  });

  it('passes cancelled and pending through', async () => {
    const native = fakeNative();
    const client = createNativePurchasesClient(asModule(native), 'play_store');
    native.purchase.mockResolvedValueOnce({ status: 'cancelled' } as never);
    native.purchase.mockResolvedValueOnce({ status: 'pending' } as never);

    await expect(client.purchase('worn.coins.100')).resolves.toEqual({ status: 'cancelled' });
    await expect(client.purchase('worn.coins.100')).resolves.toEqual({ status: 'pending' });
  });

  it('consumes coins and acknowledges subscriptions', async () => {
    const native = fakeNative();
    const client = createNativePurchasesClient(asModule(native), 'play_store');
    const coins = { store: 'play_store' as const, productId: 'worn.coins.100', transactionId: 'GPA.1', proof: 'tok-1' };

    await client.finish(coins, 'coins');
    await client.finish({ ...coins, productId: 'worn.closet.premium.monthly', proof: 'tok-2' }, 'subscription');

    expect(native.finish).toHaveBeenNthCalledWith(1, 'GPA.1', 'tok-1', true);
    expect(native.finish).toHaveBeenNthCalledWith(2, 'GPA.1', 'tok-2', false);
  });

  it('delivers transactions from the store listener until unsubscribed', () => {
    const native = fakeNative();
    const client = createNativePurchasesClient(asModule(native), 'app_store');
    const listener = vi.fn();

    const stop = client.onTransaction(listener);
    native.emit({ productId: 'worn.coins.650', transactionId: '2000000789', proof: 'jws-late' });
    stop();
    native.emit({ productId: 'worn.coins.650', transactionId: '2000000790', proof: 'jws-later' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      store: 'app_store',
      productId: 'worn.coins.650',
      transactionId: '2000000789',
      proof: 'jws-late',
    });
  });

  it('restores owned subscriptions with this store', async () => {
    const native = fakeNative();
    const client = createNativePurchasesClient(asModule(native), 'app_store');
    await expect(client.restore()).resolves.toEqual([
      { store: 'app_store', productId: 'worn.closet.premium.monthly', transactionId: '2000000456', proof: 'jws-sub' },
    ]);
  });
});
