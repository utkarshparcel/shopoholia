/**
 * Store-agnostic in-app purchase client. Digital goods (coin packs, Closet Premium) are sold
 * only through App Store / Google Play billing; the server verifies every transaction and is
 * the only source of coins and entitlements.
 */

export type PurchaseStore = 'app_store' | 'play_store';

/** Coin packs are consumables; Closet Premium is a subscription. */
export type PurchaseKind = 'coins' | 'subscription';

/** A product as the store sells it on this device, with the store's own localized price. */
export type StoreProduct = {
  storeProductId: string;
  /** Localized price string from the store, e.g. "₹299.00". */
  priceString: string;
  price: number;
  currency: string;
  /** Only the __DEV__ client sets this: the price is a sample, not a store price. */
  sample?: boolean;
};

/**
 * A paid store transaction. `proof` is what the server verifies, sent as `jws` or `purchaseToken`:
 * the StoreKit 2 signed transaction on iOS, the purchase token on Android. The __DEV__ client has none.
 */
export type StoreTransaction = {
  store: PurchaseStore;
  /** The store product id. */
  productId: string;
  /** iOS: the StoreKit transaction id. Android: the Play order id, or the purchase token when there's none. */
  transactionId: string;
  proof: string | null;
};

export type PurchaseOutcome =
  | { status: 'purchased'; transaction: StoreTransaction }
  | { status: 'cancelled' }
  /** Ask to Buy / Play pending payment: the transaction arrives later through `onTransaction`. */
  | { status: 'pending' };

export interface PurchasesClient {
  /** 'store' talks to real billing; 'dev' simulates it and exists only in __DEV__ builds. */
  readonly kind: 'store' | 'dev' | 'fake';
  /** The store this device buys through. */
  readonly store: PurchaseStore;
  /** Ties purchases to the Worn user (appAccountToken / obfuscatedAccountId). */
  configure(appUserId: string): Promise<void>;
  /** Products the store sells here; ids it doesn't know are left out. */
  getProducts(storeProductIds: string[]): Promise<StoreProduct[]>;
  purchase(storeProductId: string): Promise<PurchaseOutcome>;
  /**
   * Finishes (iOS) or consumes / acknowledges (Android) a transaction. Call it only after the
   * server confirmed it: until then the store keeps re-delivering it through `onTransaction`.
   */
  finish(transaction: StoreTransaction, kind: PurchaseKind): Promise<void>;
  /** Transactions that complete outside `purchase()`: approved pending ones, unfinished ones at launch. */
  onTransaction(listener: (transaction: StoreTransaction) => void): () => void;
  /** Active subscriptions the store account owns, for Restore Purchases. */
  restore(): Promise<StoreTransaction[]>;
}
