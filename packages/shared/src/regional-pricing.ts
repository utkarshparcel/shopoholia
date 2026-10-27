/**
 * MON-UPI-REGIONAL — India price points + regional payment method selection.
 */

import { CLOSET_PREMIUM_PRODUCTS } from "./entitlements.js";

export type RegionCode = "IN" | "US" | "GLOBAL";

export type RegionalPrice = {
  productId: string;
  region: RegionCode;
  amountMinor: number;
  currency: string;
  /** Human label e.g. ₹199 */
  priceLabel: string;
};

/** Closet Premium IN list prices (paise). Experiments may override via env. */
export const INDIA_CLOSET_PRICES: RegionalPrice[] = [
  {
    productId: "closet_premium_monthly",
    region: "IN",
    amountMinor: 19_900,
    currency: "INR",
    priceLabel: "₹199",
  },
  {
    productId: "closet_accountant_monthly",
    region: "IN",
    amountMinor: 9_900,
    currency: "INR",
    priceLabel: "₹99",
  },
  {
    productId: "closet_outfits_monthly",
    region: "IN",
    amountMinor: 12_900,
    currency: "INR",
    priceLabel: "₹129",
  },
];

export const US_CLOSET_PRICES: RegionalPrice[] = [
  {
    productId: "closet_premium_monthly",
    region: "US",
    amountMinor: 499,
    currency: "USD",
    priceLabel: "$4.99",
  },
  {
    productId: "closet_accountant_monthly",
    region: "US",
    amountMinor: 299,
    currency: "USD",
    priceLabel: "$2.99",
  },
  {
    productId: "closet_outfits_monthly",
    region: "US",
    amountMinor: 299,
    currency: "USD",
    priceLabel: "$2.99",
  },
];

export function pricesForRegion(region: RegionCode): RegionalPrice[] {
  if (region === "IN") return INDIA_CLOSET_PRICES;
  if (region === "US") return US_CLOSET_PRICES;
  return US_CLOSET_PRICES.map((p) => ({ ...p, region: "GLOBAL" as const }));
}

export function priceForProduct(
  productId: string,
  region: RegionCode,
): RegionalPrice | undefined {
  return pricesForRegion(region).find((p) => p.productId === productId);
}

export type PaymentMethod = "iap" | "upi" | "card";

/**
 * Prefer UPI for IN builds when experiment flag is on; otherwise IAP/RevenueCat.
 */
export function selectPaymentMethod(opts: {
  region: RegionCode;
  upiExperimentEnabled: boolean;
  revenueCatEnabled: boolean;
}): PaymentMethod {
  if (opts.region === "IN" && opts.upiExperimentEnabled) return "upi";
  if (opts.revenueCatEnabled) return "iap";
  if (opts.region === "IN") return "upi";
  return "iap";
}

export function isUpiPathActive(opts: {
  region: RegionCode;
  upiExperimentEnabled: boolean;
}): boolean {
  return opts.region === "IN" && opts.upiExperimentEnabled;
}

/** Offering rows for paywall (merges product catalog + regional prices). */
export function buildRegionalOfferings(region: RegionCode) {
  return CLOSET_PREMIUM_PRODUCTS.map((product) => {
    const price = priceForProduct(product.id, region);
    return {
      productId: product.id,
      label: product.label,
      entitlementIds: [...product.entitlementIds],
      trialDays: product.trialDays,
      priceLabel: price?.priceLabel ?? null,
      currency: price?.currency ?? null,
      amountMinor: price?.amountMinor ?? null,
    };
  });
}
