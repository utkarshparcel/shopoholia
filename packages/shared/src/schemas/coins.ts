import { z } from "zod";

export const CoinLedgerType = z.enum([
  "GRANT",
  "IAP_PURCHASE",
  "SPEND_ORDER",
  "SPEND_UNLOCK",
  "SPEND_RUSH",
  "EARN_STREAK",
  "EARN_SHARE",
  "EARN_OPTIN",
  "EARN_REFERRAL",
  "EARN_CASHBACK",
  "REFUND",
]);

export type CoinLedgerType = z.infer<typeof CoinLedgerType>;

export const CoinBalanceResponseSchema = z.object({
  balance: z.number().int().nonnegative(),
});

export const CoinTransactionSchema = z.object({
  id: z.string().uuid(),
  delta: z.number().int(),
  type: CoinLedgerType,
  balanceAfter: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const CoinTransactionsResponseSchema = z.object({
  transactions: z.array(CoinTransactionSchema),
  nextCursor: z.string().nullable(),
});

export const IapStoreSchema = z.enum(["app_store", "play_store"]);

/**
 * A store purchase for the server to verify and credit. Only what the store gave the app: the server
 * credits the coins `COIN_PACKS` defines for the verified product, never an amount from the client.
 */
export const IapValidateBodySchema = z.object({
  /** Store product id (`worn.coins.*`), not the pack id. */
  productId: z.string().min(1).max(200),
  store: IapStoreSchema,
  /** iOS: StoreKit `Transaction.id`. Android: `Purchase.orderId` (GPA.…), or the purchaseToken when there's no orderId. */
  transactionId: z.string().min(1).max(4_000),
  /** app_store: StoreKit 2 `Transaction.jwsRepresentation`. */
  jws: z.string().min(1).max(20_000).optional(),
  /** play_store: `Purchase.purchaseToken`. */
  purchaseToken: z.string().min(1).max(4_000).optional(),
});

export const IapValidateResponseSchema = z.object({
  success: z.literal(true),
  /** The transaction's original grant; the same on every repeat. */
  coinsGranted: z.number().int().nonnegative(),
  /** The user's balance when the response was made. */
  balanceAfter: z.number().int().nonnegative(),
  packId: z.string().optional(),
  transactionId: z.string().optional(),
  /** True when this transaction was credited before (a retry, another device, or the store notification). */
  alreadyGranted: z.boolean().optional(),
  /** True when the store refunded the purchase and its coins were taken back. */
  refunded: z.boolean().optional(),
  /** play_store: true while Google still has the purchase unconsumed. Consume it after this 200. */
  needsConsume: z.boolean().optional(),
});

export const CoinPackSchema = z.object({
  id: z.string(),
  storeProductId: z.string(),
  label: z.string(),
  coins: z.number().int().positive(),
  popular: z.boolean().optional(),
  bestValue: z.boolean().optional(),
});

/** Per store: false when the server can't verify that store's purchases (validate would answer 503). */
export const IapStoreAvailabilitySchema = z.object({
  app_store: z.boolean(),
  play_store: z.boolean(),
});

export const CoinPacksResponseSchema = z.object({
  /** False when the server can verify neither store's purchases now: disable buying. */
  purchasesAvailable: z.boolean(),
  /** Use the entry for the device's store. */
  stores: IapStoreAvailabilitySchema.optional(),
  packs: z.array(CoinPackSchema),
});

/** Daily Play reconciliation job (`play-store-reconcile`): voided purchases since `sinceMs`. */
export const PlayStoreReconcileJobSchema = z.object({
  /** Epoch ms; defaults to 30 days ago, the furthest the Voided Purchases API reaches. */
  sinceMs: z.number().int().nonnegative().optional(),
});

export type IapStore = z.infer<typeof IapStoreSchema>;
export type IapValidateBody = z.infer<typeof IapValidateBodySchema>;
export type IapValidateResponse = z.infer<typeof IapValidateResponseSchema>;
export type CoinPackInfo = z.infer<typeof CoinPackSchema>;
export type CoinPacksResponse = z.infer<typeof CoinPacksResponseSchema>;
export type IapStoreAvailability = z.infer<typeof IapStoreAvailabilitySchema>;
export type PlayStoreReconcileJob = z.infer<typeof PlayStoreReconcileJobSchema>;

export type CoinBalanceResponse = z.infer<typeof CoinBalanceResponseSchema>;
export type CoinTransaction = z.infer<typeof CoinTransactionSchema>;
export type CoinTransactionsResponse = z.infer<typeof CoinTransactionsResponseSchema>;
