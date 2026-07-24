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

export const IapValidateBodySchema = z.object({
  productId: z.string(),
  receipt: z.string(),
  revenuecatEventId: z.string().uuid().optional(),
});

export const IapValidateResponseSchema = z.object({
  success: z.literal(true),
  coinsGranted: z.number().int().nonnegative(),
  balanceAfter: z.number().int().nonnegative(),
});

export type IapValidateBody = z.infer<typeof IapValidateBodySchema>;
export type IapValidateResponse = z.infer<typeof IapValidateResponseSchema>;

export type CoinBalanceResponse = z.infer<typeof CoinBalanceResponseSchema>;
export type CoinTransaction = z.infer<typeof CoinTransactionSchema>;
export type CoinTransactionsResponse = z.infer<typeof CoinTransactionsResponseSchema>;
