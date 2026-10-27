/**
 * Merchant return-portal URLs for WV01 draft/initiate (pre-filled deep links).
 * Logistics booking still happens in-app; these open the merchant return flow.
 */

import { normalizeMerchantKey } from "./merchantDeepLink.js";

const MERCHANT_RETURN_URL: Record<string, string> = {
  amazon: "https://www.amazon.in/gp/css/returns/homepage.html",
  "amazon.in": "https://www.amazon.in/gp/css/returns/homepage.html",
  "amazon.com": "https://www.amazon.com/gp/css/returns/homepage.html",
  flipkart: "https://www.flipkart.com/orders",
  myntra: "https://www.myntra.com/my/orders",
  ajio: "https://www.ajio.com/my-account/orders",
  nykaa: "https://www.nykaafashion.com/orders",
};

/**
 * Prefill URL for “start return on merchant site”, or null when unknown.
 * Reuses the same merchant-key normalization as affiliate deep links.
 */
export function merchantReturnUrl(merchant: string): string | null {
  const key = normalizeMerchantKey(merchant);
  if (!key) return null;

  if (MERCHANT_RETURN_URL[key]) return MERCHANT_RETURN_URL[key]!;

  for (const [known, url] of Object.entries(MERCHANT_RETURN_URL)) {
    if (key.startsWith(known) || known.startsWith(key)) return url;
  }

  return null;
}
