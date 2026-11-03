/**
 * Merchant deep-link / affiliate home URLs for vault "Use it now". The affiliate id comes from
 * config (`AffiliateIds`); without one the storefront link is untagged.
 */

import { tagAffiliateUrl, type AffiliateIds, type AffiliatePlatform } from "./affiliate-ids.js";

const MERCHANT_HOME: Record<string, { url: string; platform?: AffiliatePlatform }> = {
  amazon: { url: "https://www.amazon.in/", platform: "amazon" },
  "amazon.in": { url: "https://www.amazon.in/", platform: "amazon" },
  "amazon.com": { url: "https://www.amazon.com/", platform: "amazon" },
  flipkart: { url: "https://www.flipkart.com/", platform: "flipkart" },
  myntra: { url: "https://www.myntra.com/", platform: "myntra" },
  ajio: { url: "https://www.ajio.com/", platform: "ajio" },
  nykaa: { url: "https://www.nykaafashion.com/", platform: "nykaa" },
  swiggy: { url: "https://www.swiggy.com/" },
  zomato: { url: "https://www.zomato.com/" },
};

function homeLink(entry: { url: string; platform?: AffiliatePlatform }, ids?: AffiliateIds): string {
  return entry.platform ? tagAffiliateUrl(entry.platform, entry.url, ids) : entry.url;
}

/** Normalize merchant labels from parsers / manual entry ("AMAZON", "Amazon.in"). */
export function normalizeMerchantKey(merchant: string): string {
  return merchant
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "")
    .replace(/\.+$/, "");
}

/**
 * Returns an affiliate / storefront URL for a merchant, or null when unknown.
 * Prefer known keys (amazon, myntra, flipkart, …); falls back to null rather
 * than inventing a search URL for arbitrary merchants.
 */
export function merchantDeepLink(merchant: string, affiliateIds?: AffiliateIds): string | null {
  const key = normalizeMerchantKey(merchant);
  if (!key) return null;

  const exact = MERCHANT_HOME[key];
  if (exact) return homeLink(exact, affiliateIds);

  // Prefix match: "amazonin" / "amazoncom" / "flipkartindia"
  for (const [known, entry] of Object.entries(MERCHANT_HOME)) {
    if (key.startsWith(known) || known.startsWith(key)) return homeLink(entry, affiliateIds);
  }

  return null;
}
