/**
 * WV02-BALANCE-CHECK — merchant balance refresh capability + re-check cadence.
 *
 * Worn mirrors merchant gift-card / store-credit balances. Where a partner API
 * (or hosted balance endpoint) exists we refresh; otherwise we nudge the user
 * to manually re-check on a cadence.
 */

import { normalizeMerchantKey } from "./merchantDeepLink.js";

/** Default: nudge re-check 30 days after last check / update. */
export const BALANCE_RECHECK_INTERVAL_MS = 30 * 86_400_000;

/**
 * Merchants known to support (or planned) programmatic balance lookup.
 * Real calls go through `MERCHANT_BALANCE_API_URL` when configured; otherwise
 * the API layer uses an in-process stub for these keys only.
 */
const API_CAPABLE_MERCHANTS = new Set([
  "amazon",
  "amazon.in",
  "amazon.com",
  "flipkart",
]);

/** Optional public balance-check pages for manual re-check CTAs. */
const MANUAL_CHECK_URL: Record<string, string> = {
  amazon: "https://www.amazon.in/gp/css/gc/balance",
  "amazon.in": "https://www.amazon.in/gp/css/gc/balance",
  "amazon.com": "https://www.amazon.com/gp/css/gc/balance",
  myntra: "https://www.myntra.com/",
  ajio: "https://www.ajio.com/",
  nykaa: "https://www.nykaafashion.com/",
  swiggy: "https://www.swiggy.com/",
  zomato: "https://www.zomato.com/",
};

export type MerchantBalanceCheckMode = "api" | "manual";

export type MerchantBalanceCapability = {
  mode: MerchantBalanceCheckMode;
  /** Partner / hosted API available for this merchant key. */
  apiCapable: boolean;
  /** Merchant gift-card balance page when user must re-check manually. */
  checkUrl: string | null;
};

export function merchantBalanceCapability(
  merchant: string,
): MerchantBalanceCapability {
  const key = normalizeMerchantKey(merchant);
  const apiCapable = key.length > 0 && API_CAPABLE_MERCHANTS.has(key)
    ? true
    : [...API_CAPABLE_MERCHANTS].some(
        (known) => key.startsWith(known) || known.startsWith(key),
      );

  let checkUrl: string | null = null;
  if (key && MANUAL_CHECK_URL[key]) {
    checkUrl = MANUAL_CHECK_URL[key]!;
  } else if (key) {
    for (const [known, url] of Object.entries(MANUAL_CHECK_URL)) {
      if (key.startsWith(known) || known.startsWith(key)) {
        checkUrl = url;
        break;
      }
    }
  }

  return {
    mode: apiCapable ? "api" : "manual",
    apiCapable,
    checkUrl,
  };
}

/**
 * Whether a re-check nudge should fire given the last balance check time.
 * Uses `updatedAt` / explicit last-checked timestamp as the clock.
 */
export function needsBalanceRecheckReminder(
  lastCheckedAt: Date | string | null | undefined,
  opts: { now?: Date; intervalMs?: number } = {},
): boolean {
  if (!lastCheckedAt) return true;
  const now = opts.now ?? new Date();
  const interval = opts.intervalMs ?? BALANCE_RECHECK_INTERVAL_MS;
  const last = new Date(lastCheckedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= interval;
}

/** Delay until the next re-check nudge; null when due immediately (caller uses 100ms). */
export function computeBalanceRecheckDelayMs(
  lastCheckedAt: Date | string,
  opts: { now?: Date; intervalMs?: number } = {},
): number {
  const now = opts.now ?? new Date();
  const interval = opts.intervalMs ?? BALANCE_RECHECK_INTERVAL_MS;
  const last = new Date(lastCheckedAt).getTime();
  const dueAt = last + interval;
  const delay = dueAt - now.getTime();
  return delay <= 0 ? 100 : delay;
}

export function balanceRecheckJobId(accountId: string): string {
  return `credit-balance-recheck:${accountId}`;
}

export function balanceRecheckCopy(merchant: string): {
  title: string;
  body: string;
} {
  return {
    title: `Re-check ${merchant} balance`,
    body: `Your ${merchant} credit may have changed. Confirm the balance in WORN so found-money stays accurate.`,
  };
}
