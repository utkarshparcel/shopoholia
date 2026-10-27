import { randomUUID } from 'expo-crypto';
import { COIN_PACKS, priceForProduct } from '@worn/shared';
import { create } from 'zustand';

import { coinPackIdFor, premiumProductIdFor } from './products';

import type {
  PurchasesClient,
  PurchaseStore,
  StoreProduct,
  StoreTransaction,
} from './types';

/**
 * __DEV__-only purchases client: a simulated store, so the whole purchase flow (server
 * validation included) runs on web and in Expo Go. Prices are the ₹ figures from the shared
 * catalogue, marked `sample`. Its transaction ids start with "simulated-", which the server
 * accepts only with IAP_ALLOW_SIMULATED=1 outside production. Never selected in a release build.
 */

export type DevSheetChoice = 'buy' | 'pending' | 'cancel';

type DevSheetRequest = { product: StoreProduct; resolve: (choice: DevSheetChoice) => void };

/** The simulated store sheet; `DevPurchaseSheet` renders it. */
export const useDevPurchaseSheet = create<{
  request: DevSheetRequest | null;
  choose: (choice: DevSheetChoice) => void;
}>()((set, get) => ({
  request: null,
  choose: (choice) => {
    const request = get().request;
    set({ request: null });
    request?.resolve(choice);
  },
}));

export function presentDevPurchaseSheet(product: StoreProduct): Promise<DevSheetChoice> {
  return new Promise((resolve) => {
    // A second sheet replaces the first; the first one counts as cancelled.
    useDevPurchaseSheet.getState().request?.resolve('cancel');
    useDevPurchaseSheet.setState({ request: { product, resolve } });
  });
}

function amountOf(label: string): number {
  return Number(label.replace(/[^0-9.]/g, '')) || 0;
}

export function devProduct(storeProductId: string): StoreProduct | null {
  const packId = coinPackIdFor(storeProductId);
  const pack = COIN_PACKS.find((p) => p.id === packId);
  if (pack) {
    return {
      storeProductId,
      priceString: pack.price,
      price: amountOf(pack.price),
      currency: 'INR',
      sample: true,
    };
  }
  const premiumId = premiumProductIdFor(storeProductId);
  const premium = premiumId ? priceForProduct(premiumId, 'IN') : null;
  if (premium) {
    return {
      storeProductId,
      priceString: premium.priceLabel,
      price: premium.amountMinor / 100,
      currency: premium.currency,
      sample: true,
    };
  }
  return null;
}

export function createDevPurchasesClient(opts: {
  present: (product: StoreProduct) => Promise<DevSheetChoice>;
  store: PurchaseStore;
  /** How long a simulated Ask to Buy waits before it is approved. */
  approveAfterMs?: number;
}): PurchasesClient {
  let appUserId = '';
  let approvals: ReturnType<typeof setTimeout>[] = [];
  const listeners = new Set<(transaction: StoreTransaction) => void>();
  const subscriptions = new Map<string, StoreTransaction>();

  const transactionFor = (productId: string): StoreTransaction => {
    const transaction: StoreTransaction = {
      store: opts.store,
      productId,
      transactionId: `simulated-${randomUUID()}`,
      proof: null,
    };
    if (premiumProductIdFor(productId)) subscriptions.set(productId, transaction);
    return transaction;
  };

  return {
    kind: 'dev',
    store: opts.store,
    async configure(userId) {
      if (userId !== appUserId) {
        // Another account: drop the last one's simulated subscriptions and Ask to Buy approvals.
        subscriptions.clear();
        approvals.forEach(clearTimeout);
        approvals = [];
      }
      appUserId = userId;
    },
    async getProducts(ids) {
      return ids.map(devProduct).filter((p): p is StoreProduct => p !== null);
    },
    async purchase(storeProductId) {
      const product = devProduct(storeProductId);
      if (!product || !appUserId) throw new Error('product not available');
      const choice = await opts.present(product);
      if (choice === 'cancel') return { status: 'cancelled' };
      if (choice === 'pending') {
        approvals.push(
          setTimeout(() => {
            const transaction = transactionFor(storeProductId);
            for (const listener of listeners) listener(transaction);
          }, opts.approveAfterMs ?? 5_000),
        );
        return { status: 'pending' };
      }
      return { status: 'purchased', transaction: transactionFor(storeProductId) };
    },
    async finish() {},
    onTransaction(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      return [...subscriptions.values()];
    },
  };
}
