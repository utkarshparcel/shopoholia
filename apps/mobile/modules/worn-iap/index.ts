import { requireOptionalNativeModule, type NativeModule } from 'expo';

/** A store product as StoreKit 2 / Play Billing reports it, with the store's localized price. */
export type WornIapProduct = {
  id: string;
  displayPrice: string;
  price: number;
  currencyCode: string;
};

/**
 * A paid store transaction. `proof` is the StoreKit 2 `jwsRepresentation` on iOS and the Play
 * `purchaseToken` on Android. `transactionId` is the StoreKit transaction id, or the Play order id
 * (the purchase token when Play gives no order id).
 */
export type WornIapTransaction = {
  productId: string;
  transactionId: string;
  proof: string;
};

export type WornIapPurchaseResult =
  | { status: 'purchased'; transaction: WornIapTransaction }
  | { status: 'cancelled' }
  | { status: 'pending' };

export type WornIapEvents = {
  /** A transaction that arrived outside purchase(): Ask to Buy / pending approvals, unfinished at launch. */
  onTransaction(transaction: WornIapTransaction): void;
};

export declare class WornIapNativeModule extends NativeModule<WornIapEvents> {
  /** Ties purchases to the Worn account, starts the store listener and replays unfinished transactions. */
  configure(appAccountToken: string, obfuscatedAccountId: string): Promise<void>;
  getProducts(productIds: string[], subscriptionIds: string[]): Promise<WornIapProduct[]>;
  purchase(productId: string, subscription: boolean): Promise<WornIapPurchaseResult>;
  /** finish() on iOS; consume (coins) or acknowledge (subscriptions) on Android. Only after the server's final answer. */
  finish(transactionId: string, purchaseToken: string, consumable: boolean): Promise<void>;
  /** Subscriptions this store account owns now (StoreKit currentEntitlements / Play SUBS purchases). */
  restore(): Promise<WornIapTransaction[]>;
}

/** null on web, in Expo Go, and in any build made without the native module. */
export default requireOptionalNativeModule<WornIapNativeModule>('WornIap');
