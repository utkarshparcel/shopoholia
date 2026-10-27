import type { PurchaseOutcome, PurchasesClient, PurchaseStore, StoreProduct, StoreTransaction } from './types';

/**
 * Tests only: a purchases client the test drives. Never selected by `getPurchasesClient`.
 */
export function createFakePurchasesClient(opts: {
  store?: PurchaseStore;
  kind?: PurchasesClient['kind'];
  products?: StoreProduct[];
  purchase?: (storeProductId: string) => Promise<PurchaseOutcome>;
  restore?: () => Promise<StoreTransaction[]>;
} = {}) {
  const listeners = new Set<(transaction: StoreTransaction) => void>();
  const calls = { configure: [] as string[], purchase: [] as string[], finish: [] as StoreTransaction[] };
  const client: PurchasesClient & { emit: (t: StoreTransaction) => void; calls: typeof calls } = {
    kind: opts.kind ?? 'fake',
    store: opts.store ?? 'app_store',
    calls,
    async configure(userId) {
      calls.configure.push(userId);
    },
    async getProducts(ids) {
      return (opts.products ?? []).filter((p) => ids.includes(p.storeProductId));
    },
    async purchase(storeProductId) {
      calls.purchase.push(storeProductId);
      return opts.purchase ? opts.purchase(storeProductId) : { status: 'cancelled' };
    },
    async finish(transaction) {
      calls.finish.push(transaction);
    },
    onTransaction(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      return opts.restore ? opts.restore() : [];
    },
    emit(transaction) {
      for (const listener of listeners) listener(transaction);
    },
  };
  return client;
}
