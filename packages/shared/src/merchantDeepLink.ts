/**
 * Merchant deep-link / affiliate home URLs for vault "Use it now".
 * Reuses the same affiliate tag patterns as seed listing cashback links.
 */

const AFFILIATE_HOME: Record<string, string> = {
  amazon: "https://www.amazon.in/?tag=shopoholia-21",
  "amazon.in": "https://www.amazon.in/?tag=shopoholia-21",
  "amazon.com": "https://www.amazon.com/?tag=shopoholia-21",
  flipkart: "https://www.flipkart.com/?affid=yourshopoholia",
  myntra: "https://www.myntra.com/?ref=shopoholia",
  ajio: "https://www.ajio.com/?affiliate=shopoholia",
  nykaa: "https://www.nykaafashion.com/?utm_source=shopoholia",
  swiggy: "https://www.swiggy.com/",
  zomato: "https://www.zomato.com/",
};

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
export function merchantDeepLink(merchant: string): string | null {
  const key = normalizeMerchantKey(merchant);
  if (!key) return null;

  if (AFFILIATE_HOME[key]) return AFFILIATE_HOME[key]!;

  // Prefix match: "amazonin" / "amazoncom" / "flipkartindia"
  for (const [known, url] of Object.entries(AFFILIATE_HOME)) {
    if (key.startsWith(known) || known.startsWith(key)) return url;
  }

  return null;
}
