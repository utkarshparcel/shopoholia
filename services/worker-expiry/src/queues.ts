export const CREDIT_EXPIRY_QUEUE = "credit-expiry";
export const CREDIT_EXPIRY_JOB = "credit-expiry-reminder";

export type CreditExpiryPayload = {
  accountId: string;
  userId: string;
  merchant: string;
  expiresAt: string;
  /** Set on a snoozed reminder (apps/api expiry.ts); it gets its own push dedupe key. */
  snoozedUntil?: string;
};

export const WARRANTY_EXPIRY_QUEUE = "warranty-expiry";
export const WARRANTY_EXPIRY_JOB = "warranty-expiry-reminder";

export type WarrantyExpiryPayload = {
  warrantyId: string;
  userId: string;
  itemTitle: string;
  provider: string;
  coverageUntil: string;
  snoozedUntil?: string;
};

/** WV02-BALANCE-CHECK — delayed nudge to re-check merchant balances. */
export const BALANCE_RECHECK_QUEUE = "credit-balance-recheck";
export const BALANCE_RECHECK_JOB = "credit-balance-recheck-reminder";

export type BalanceRecheckPayload = {
  accountId: string;
  userId: string;
  merchant: string;
  lastCheckedAt: string;
};

/** U006 — T-3d cashback claim deadline nudge. */
export const CASHBACK_CLAIM_QUEUE = "cashback-claim-deadline";
export const CASHBACK_CLAIM_JOB = "cashback-claim-deadline-reminder";

export type CashbackClaimDeadlinePayload = {
  claimId: string;
  userId: string;
  source: string;
  merchant: string | null;
  amountMinor: number;
  currency: string;
  expiresAt: string;
};
