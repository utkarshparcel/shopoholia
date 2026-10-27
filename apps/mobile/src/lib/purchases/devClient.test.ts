import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDevPurchasesClient, devProduct, presentDevPurchaseSheet, useDevPurchaseSheet } from './devClient';

afterEach(() => {
  vi.useRealTimers();
  useDevPurchaseSheet.setState({ request: null });
});

describe('dev purchases client', () => {
  it('labels its prices as samples from the shared catalogue', () => {
    expect(devProduct('worn.coins.350')).toMatchObject({ storeProductId: 'worn.coins.350', currency: 'INR', sample: true });
    expect(devProduct('worn.closet.premium.monthly')).toMatchObject({ currency: 'INR', sample: true });
    expect(devProduct('worn.coins.unknown')).toBeNull();
  });

  it('makes simulated transactions with no proof', async () => {
    const client = createDevPurchasesClient({ present: async () => 'buy', store: 'app_store' });
    await client.configure('user-1');

    const outcome = await client.purchase('worn.coins.350');

    expect(outcome.status).toBe('purchased');
    if (outcome.status !== 'purchased') return;
    expect(outcome.transaction).toMatchObject({ store: 'app_store', productId: 'worn.coins.350', proof: null });
    expect(outcome.transaction.transactionId).toMatch(/^simulated-/);
  });

  it('refuses to buy before configure', async () => {
    const client = createDevPurchasesClient({ present: async () => 'buy', store: 'app_store' });
    await expect(client.purchase('worn.coins.350')).rejects.toThrow();
  });

  it('cancels silently', async () => {
    const client = createDevPurchasesClient({ present: async () => 'cancel', store: 'play_store' });
    await client.configure('user-1');
    await expect(client.purchase('worn.coins.100')).resolves.toEqual({ status: 'cancelled' });
  });

  it('delivers an approved Ask to Buy through the listener', async () => {
    vi.useFakeTimers();
    const client = createDevPurchasesClient({ present: async () => 'pending', store: 'app_store', approveAfterMs: 1_000 });
    const listener = vi.fn();
    client.onTransaction(listener);
    await client.configure('user-1');

    await expect(client.purchase('worn.coins.650')).resolves.toEqual({ status: 'pending' });
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ productId: 'worn.coins.650' }));
  });

  it('drops one account\'s approvals and subscriptions when another signs in', async () => {
    vi.useFakeTimers();
    let choice: 'buy' | 'pending' = 'buy';
    const client = createDevPurchasesClient({ present: async () => choice, store: 'app_store', approveAfterMs: 1_000 });
    const listener = vi.fn();
    client.onTransaction(listener);
    await client.configure('user-1');
    await client.purchase('worn.closet.premium.monthly');
    choice = 'pending';
    await client.purchase('worn.coins.100');

    await client.configure('user-2');
    vi.advanceTimersByTime(1_000);

    expect(listener).not.toHaveBeenCalled();
    expect(await client.restore()).toEqual([]);
  });

  it('restores a simulated subscription', async () => {
    const client = createDevPurchasesClient({ present: async () => 'buy', store: 'app_store' });
    await client.configure('user-1');
    await client.purchase('worn.closet.premium.monthly');
    expect(await client.restore()).toEqual([expect.objectContaining({ productId: 'worn.closet.premium.monthly' })]);
  });

  it('a second sheet cancels the first', async () => {
    const product = devProduct('worn.coins.100')!;
    const first = presentDevPurchaseSheet(product);
    const second = presentDevPurchaseSheet(product);
    useDevPurchaseSheet.getState().choose('buy');
    await expect(first).resolves.toBe('cancel');
    await expect(second).resolves.toBe('buy');
  });
});
