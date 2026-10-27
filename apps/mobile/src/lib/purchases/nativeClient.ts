import type { WornIapNativeModule, WornIapTransaction } from '@/modules/worn-iap';

import { appAccountTokenFor, obfuscatedAccountIdFor } from './accountBinding';
import { premiumProductIdFor } from './products';
import type { PurchasesClient, PurchaseStore, StoreProduct, StoreTransaction } from './types';

/**
 * The real store client over the local `WornIap` Expo module: StoreKit 2 on iOS, Play Billing on
 * Android. Prices are the store's localized prices; transactions are finished (consumed or
 * acknowledged on Android) only when the queue calls `finish` after the server's final answer.
 */
export function createNativePurchasesClient(native: WornIapNativeModule, store: PurchaseStore): PurchasesClient {
  let configuredFor: string | null = null;
  let configuring: Promise<void> | null = null;

  const withStore = (t: WornIapTransaction): StoreTransaction => ({
    store,
    productId: t.productId,
    transactionId: t.transactionId,
    proof: t.proof || null,
  });

  return {
    kind: 'store',
    store,
    configure(userId) {
      if (configuredFor === userId && configuring) return configuring;
      configuredFor = userId;
      configuring = (async () => {
        const [appAccountToken, obfuscatedAccountId] = await Promise.all([
          appAccountTokenFor(userId),
          obfuscatedAccountIdFor(userId),
        ]);
        await native.configure(appAccountToken, obfuscatedAccountId);
      })().catch((error: unknown) => {
        // Try again on the next call.
        configuredFor = null;
        configuring = null;
        throw error;
      });
      return configuring;
    },
    async getProducts(ids) {
      const subscriptionIds = ids.filter((id) => premiumProductIdFor(id));
      const productIds = ids.filter((id) => !premiumProductIdFor(id));
      const products = await native.getProducts(productIds, subscriptionIds);
      return products.map(
        (p): StoreProduct => ({
          storeProductId: p.id,
          priceString: p.displayPrice,
          price: p.price,
          currency: p.currencyCode,
        }),
      );
    },
    async purchase(storeProductId) {
      const outcome = await native.purchase(storeProductId, premiumProductIdFor(storeProductId) !== null);
      if (outcome.status === 'purchased') {
        return { status: 'purchased', transaction: withStore(outcome.transaction) };
      }
      return outcome;
    },
    async finish(transaction, kind) {
      await native.finish(transaction.transactionId, transaction.proof ?? '', kind === 'coins');
    },
    onTransaction(listener) {
      const subscription = native.addListener('onTransaction', (t) => listener(withStore(t)));
      return () => subscription.remove();
    },
    async restore() {
      return (await native.restore()).map(withStore);
    },
  };
}
