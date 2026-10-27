/**
 * Merchant return vs exchange windows.
 * Exchange (size swap) often differs from refund/return — India apparel especially.
 */

/** Days from purchase/delivery for a refund-style return. */
export const MERCHANT_RETURN_WINDOW_DAYS: Record<string, number> = {
  amazon: 30,
  flipkart: 7,
  myntra: 30,
  ajio: 15,
  nykaa: 15,
  zara: 30,
  h_m: 14,
  "h&m": 14,
  mango: 30,
};

/**
 * Days for size/color exchange. Intentionally differs from return for several merchants
 * (e.g. Flipkart exchange often longer than return; Ajio exchange shorter).
 */
export const MERCHANT_EXCHANGE_WINDOW_DAYS: Record<string, number> = {
  amazon: 30,
  flipkart: 10, // exchange window ≠ 7-day return
  myntra: 14, // try-and-buy exchange shorter than 30d return
  ajio: 7, // exchange tighter than 15d return
  nykaa: 15,
  zara: 30,
  h_m: 30, // H&M exchange often longer than return
  "h&m": 30,
  mango: 30,
};

const DEFAULT_RETURN_DAYS = 14;
const DEFAULT_EXCHANGE_DAYS = 14;

function merchantKey(merchant: string): string {
  return merchant.toLowerCase().trim().replace(/\s+/g, "_");
}

export function returnWindowDays(merchant: string): number {
  const key = merchantKey(merchant);
  return (
    MERCHANT_RETURN_WINDOW_DAYS[key] ??
    MERCHANT_RETURN_WINDOW_DAYS[key.replace(/_/g, "")] ??
    DEFAULT_RETURN_DAYS
  );
}

export function exchangeWindowDays(merchant: string): number {
  const key = merchantKey(merchant);
  return (
    MERCHANT_EXCHANGE_WINDOW_DAYS[key] ??
    MERCHANT_EXCHANGE_WINDOW_DAYS[key.replace(/_/g, "")] ??
    DEFAULT_EXCHANGE_DAYS
  );
}

export function computeReturnWindowDeadline(
  purchasedAt: Date,
  merchant: string,
): Date {
  return new Date(purchasedAt.getTime() + returnWindowDays(merchant) * 86_400_000);
}

export function computeExchangeWindowDeadline(
  purchasedAt: Date,
  merchant: string,
): Date {
  return new Date(purchasedAt.getTime() + exchangeWindowDays(merchant) * 86_400_000);
}

/** True when this merchant's exchange window length ≠ return window length. */
export function merchantWindowsDiffer(merchant: string): boolean {
  return returnWindowDays(merchant) !== exchangeWindowDays(merchant);
}

export function daysLeft(deadline: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}
