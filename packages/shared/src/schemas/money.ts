import { z } from "zod";

export const MoneyAccountKindSchema = z.enum([
  "CASH",
  "STORE_CREDIT",
  "GIFT_CARD",
  "LOYALTY_POINTS",
  "PROMO_CREDIT",
]);

export type MoneyAccountKind = z.infer<typeof MoneyAccountKindSchema>;

export const MoneyLedgerTypeSchema = z.enum([
  "DEPOSIT",
  "WITHDRAW",
  "SPEND",
  "REFUND",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "PURCHASE_REWARD",
]);

export type MoneyLedgerType = z.infer<typeof MoneyLedgerTypeSchema>;

export const MoneyAccountStatusSchema = z.enum([
  "ACTIVE",
  "FROZEN",
  "CLOSED",
]);

export type MoneyAccountStatus = z.infer<typeof MoneyAccountStatusSchema>;

export const MoneyAccountBalanceCheckSchema = z.object({
  mode: z.enum(["api", "manual"]),
  due: z.boolean(),
  checkUrl: z.string().url().nullable(),
});

export const MoneyAccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  kind: MoneyAccountKindSchema,
  merchant: z.string(),
  currency: z.string(),
  balanceCacheMinor: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable(),
  status: MoneyAccountStatusSchema,
  /** Affiliate / storefront deep-link for vault "Use it now" (when known). */
  link: z.string().url().nullable().optional(),
  /** Last balance refresh / manual confirm (ISO). Proxied from account.updatedAt. */
  lastBalanceCheckedAt: z.string().datetime().nullable().optional(),
  /** WV02-BALANCE-CHECK — api refresh vs manual re-check nudge. */
  balanceCheck: MoneyAccountBalanceCheckSchema.optional(),
});

export const MoneyLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  delta: z.number().int(),
  type: MoneyLedgerTypeSchema,
  refType: z.string().nullable(),
  refId: z.string().uuid().nullable(),
  balanceAfter: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const PostMoneyLedgerBodySchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  delta: z.number().int(),
  type: MoneyLedgerTypeSchema,
  refType: z.string().optional(),
  refId: z.string().uuid().optional(),
});

export const MoneyBalanceResponseSchema = z.object({
  accountId: z.string().uuid(),
  balanceMinor: z.number().int().nonnegative(),
});

export const MoneyAccountsResponseSchema = z.object({
  accounts: z.array(MoneyAccountSchema),
});

export const MoneyTransactionsResponseSchema = z.object({
  transactions: z.array(MoneyLedgerEntrySchema),
  /** Pass back as `?cursor=` for the next page; null on the last page. */
  nextCursor: z.string().nullable().optional(),
});

/** Fixed sample for empty-state demo (`demo: true` on POST /credits). */
export const DEMO_GIFT_CARD = {
  kind: "GIFT_CARD" as const,
  merchant: "Myntra",
  currency: "INR",
  /** ₹500 */
  balanceMinor: 50_000,
} as const;

/** Metadata from barcode / photo capture of a physical gift card. */
export const GiftCardCaptureMetaSchema = z.object({
  source: z.enum(["BARCODE", "PHOTO"]),
  /** Raw barcode / OCR string. */
  raw: z.string().optional(),
  /** Full card code when known. */
  code: z.string().optional(),
  /** Last 4 of the card / barcode. */
  last4: z.string().min(4).max(8).optional(),
  /** Optional storage key of the photo used for capture. */
  imageKey: z.string().optional(),
});

export type GiftCardCaptureMeta = z.infer<typeof GiftCardCaptureMetaSchema>;

/** Prefill response from POST /credits/capture (photo and/or barcode). */
export const CreditCaptureResponseSchema = z.object({
  merchant: z.string().nullable(),
  code: z.string().nullable(),
  last4: z.string().nullable(),
  /** Suggested balance from OCR when present; user still confirms. */
  suggestedBalanceMinor: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  capture: GiftCardCaptureMetaSchema,
});

export type CreditCaptureResponse = z.infer<typeof CreditCaptureResponseSchema>;

/** JSON body for barcode-only capture (no photo). */
export const CaptureCreditBodySchema = z.object({
  barcode: z.string().min(4).max(128),
});

export type CaptureCreditBody = z.infer<typeof CaptureCreditBodySchema>;

/** Add a manual gift card, store credit, loyalty balance, or promo/coupon credit. */
export const AddCreditBodySchema = z.object({
  kind: MoneyAccountKindSchema,
  merchant: z.string().min(1),
  currency: z.string().optional(),
  balanceMinor: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable().optional(),
  /** When set, used as DEPOSIT refId so retries do not create duplicate cards. */
  idempotencyKey: z.string().uuid().optional(),
  /**
   * When true, server seeds the sample ₹500 Myntra gift card (overrides
   * kind/merchant/balance). Needs FINANCIAL consent like any other credit.
   */
  demo: z.boolean().optional(),
  /** Physical card scan / photo capture metadata (prefills audited on add). */
  capture: GiftCardCaptureMetaSchema.optional(),
  /**
   * U014 — user confirmed add despite near-duplicate warning (same merchant+amount ±1d).
   * Audited as money.credit.added_override.
   */
  forceDuplicate: z.boolean().optional(),
  /** Existing near-dup account id when forceDuplicate is set (audit trail). */
  nearDuplicateOf: z.string().uuid().optional(),
});

export const AddCreditResponseSchema = MoneyAccountSchema;

/** Idempotent spend against a credit account. */
export const SpendCreditBodySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});

export const SpendCreditResponseSchema = z.object({
  balanceMinor: z.number().int().nonnegative(),
});

/** Undo a SPEND within the 60s grace window (U001). */
export const UndoSpendCreditBodySchema = z.object({
  /** Original spend idempotencyKey (SPEND ledger refId). */
  idempotencyKey: z.string().uuid(),
});

export const UndoSpendCreditResponseSchema = z.object({
  balanceMinor: z.number().int().nonnegative(),
  undone: z.boolean(),
});

/** Merge duplicate gift cards / store credits for one merchant (U002). */
export const MergeCreditsBodySchema = z
  .object({
    targetAccountId: z.string().uuid(),
    sourceAccountId: z.string().uuid(),
  })
  .refine((b) => b.targetAccountId !== b.sourceAccountId, {
    message: "targetAccountId and sourceAccountId must differ",
  });

export const MergeCreditsResponseSchema = z.object({
  account: MoneyAccountSchema,
  mergedFromId: z.string().uuid(),
  transferredMinor: z.number().int().nonnegative(),
});

/** Mark expiry checklist handled — snoozes credit expiry push 7d (U003). */
export const ExpiryHandledBodySchema = z.object({
  /** Optional absolute snooze-until; default now+7d. */
  until: z.string().datetime().optional(),
});

export const ExpiryHandledResponseSchema = z.object({
  accountId: z.string().uuid(),
  snoozedUntil: z.string().datetime(),
  status: z.enum(["published", "skipped"]),
});

/** POST /credits/:id/balance-check — refresh via API or return manual path. */
export const BalanceCheckResponseSchema = z.object({
  mode: z.enum(["api", "manual"]),
  refreshed: z.boolean(),
  balanceMinor: z.number().int().nonnegative(),
  previousBalanceMinor: z.number().int().nonnegative(),
  checkUrl: z.string().url().nullable(),
  message: z.string(),
});

/** POST /credits/:id/confirm-balance — user-confirmed merchant balance. */
export const ConfirmBalanceBodySchema = z.object({
  balanceMinor: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid().optional(),
});

export const ConfirmBalanceResponseSchema = z.object({
  balanceMinor: z.number().int().nonnegative(),
  adjusted: z.boolean(),
});

export type MoneyAccountsResponse = z.infer<typeof MoneyAccountsResponseSchema>;
export type MoneyTransactionsResponse = z.infer<
  typeof MoneyTransactionsResponseSchema
>;
export type AddCreditBody = z.infer<typeof AddCreditBodySchema>;
export type AddCreditResponse = z.infer<typeof AddCreditResponseSchema>;
export type SpendCreditBody = z.infer<typeof SpendCreditBodySchema>;
export type SpendCreditResponse = z.infer<typeof SpendCreditResponseSchema>;
export type UndoSpendCreditBody = z.infer<typeof UndoSpendCreditBodySchema>;
export type UndoSpendCreditResponse = z.infer<
  typeof UndoSpendCreditResponseSchema
>;
export type MergeCreditsBody = z.infer<typeof MergeCreditsBodySchema>;
export type MergeCreditsResponse = z.infer<typeof MergeCreditsResponseSchema>;
export type ExpiryHandledBody = z.infer<typeof ExpiryHandledBodySchema>;
export type ExpiryHandledResponse = z.infer<typeof ExpiryHandledResponseSchema>;
export type BalanceCheckResponse = z.infer<typeof BalanceCheckResponseSchema>;
export type ConfirmBalanceBody = z.infer<typeof ConfirmBalanceBodySchema>;
export type ConfirmBalanceResponse = z.infer<
  typeof ConfirmBalanceResponseSchema
>;

export type MoneyAccount = z.infer<typeof MoneyAccountSchema>;
export type MoneyLedgerEntry = z.infer<typeof MoneyLedgerEntrySchema>;
export type PostMoneyLedgerBody = z.infer<typeof PostMoneyLedgerBodySchema>;
export type MoneyBalanceResponse = z.infer<typeof MoneyBalanceResponseSchema>;

/** Grace window for undoing a partial spend (U001). */
export const CREDIT_SPEND_UNDO_WINDOW_MS = 60_000;
