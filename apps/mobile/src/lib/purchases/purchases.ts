import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import WornIap from '@/modules/worn-iap';

import { syncSubscriptionPurchase, validateCoinPurchase } from './api';
import { createDevPurchasesClient, presentDevPurchaseSheet } from './devClient';
import { createNativePurchasesClient } from './nativeClient';
import { premiumProductIdFor } from './products';
import { createPurchaseQueue } from './queue';
import type { PurchaseKind, PurchasesClient } from './types';

const store = Platform.OS === 'android' ? 'play_store' : 'app_store';

let selected: PurchasesClient | null | undefined;

/**
 * The billing client for this build: the native `WornIap` module when the build has it (iOS and
 * Android development and release builds). Without it (web, Expo Go) there is none and the shop
 * says so; only __DEV__ builds fall back to the simulated store.
 */
export function getPurchasesClient(): PurchasesClient | null {
  if (selected === undefined) {
    selected = WornIap
      ? createNativePurchasesClient(WornIap, store)
      : __DEV__
        ? createDevPurchasesClient({ present: presentDevPurchaseSheet, store })
        : null;
  }
  return selected;
}

/** Tests only: `undefined` goes back to the build's own client. */
export function setPurchasesClientForTests(client: PurchasesClient | null | undefined): void {
  selected = client;
}

/** Closet Premium products are subscriptions; everything else the shop sells is a coin pack. */
export function purchaseKindFor(storeProductId: string): PurchaseKind {
  return premiumProductIdFor(storeProductId) ? 'subscription' : 'coins';
}

export const purchaseQueue = createPurchaseQueue({
  storage: AsyncStorage,
  validateCoins: validateCoinPurchase,
  syncSubscription: syncSubscriptionPurchase,
  finish: async (transaction, kind) => {
    await getPurchasesClient()?.finish(transaction, kind);
  },
});
