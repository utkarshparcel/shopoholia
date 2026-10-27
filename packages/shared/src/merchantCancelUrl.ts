/**
 * U027 — Merchant cancel / cooling-off deep links for post-purchase impulse undo.
 * Parallel to merchantReturnUrl; used when cancel window is still open.
 */

import { normalizeMerchantKey } from "./merchantDeepLink.js";

const MERCHANT_CANCEL_URL: Record<string, string> = {
  amazon: "https://www.amazon.in/gp/css/order-history",
  "amazon.in": "https://www.amazon.in/gp/css/order-history",
  "amazon.com": "https://www.amazon.com/gp/your-account/order-history",
  flipkart: "https://www.flipkart.com/orders",
  myntra: "https://www.myntra.com/my/orders",
  ajio: "https://www.ajio.com/my-account/orders",
  nykaa: "https://www.nykaafashion.com/orders",
};

/**
 * Prefill URL for “cancel order on merchant site”, or null when unknown.
 */
export function merchantCancelUrl(merchant: string): string | null {
  const key = normalizeMerchantKey(merchant);
  if (!key) return null;

  if (MERCHANT_CANCEL_URL[key]) return MERCHANT_CANCEL_URL[key]!;

  for (const [known, url] of Object.entries(MERCHANT_CANCEL_URL)) {
    if (key.startsWith(known) || known.startsWith(key)) return url;
  }

  return null;
}
