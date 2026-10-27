/**
 * N12 — Price-drop on owned brands: watchlist threshold vs affiliate catalog price.
 */

/** True when current price is at least `thresholdPct` below the watched baseline. */
export function priceDropThresholdMet(
  watchedMinor: number,
  currentMinor: number,
  thresholdPct: number,
): boolean {
  if (watchedMinor <= 0 || currentMinor < 0) return false;
  if (thresholdPct <= 0) return currentMinor < watchedMinor;
  if (thresholdPct >= 100) return currentMinor === 0;
  const dropPct = ((watchedMinor - currentMinor) / watchedMinor) * 100;
  return dropPct >= thresholdPct;
}

/** Drop amount in minor units (0 when current ≥ watched). */
export function priceDropAmountMinor(watchedMinor: number, currentMinor: number): number {
  return Math.max(0, watchedMinor - currentMinor);
}

export function normalizeBrandKey(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match listing title/tags against a wardrobe brand (case-insensitive substring). */
export function listingMatchesBrand(
  brand: string,
  listing: { title: string; tags?: string[] | null },
): boolean {
  const key = normalizeBrandKey(brand);
  if (!key) return false;
  const title = listing.title.toLowerCase();
  if (title.includes(key)) return true;
  for (const tag of listing.tags ?? []) {
    if (normalizeBrandKey(tag).includes(key) || key.includes(normalizeBrandKey(tag))) {
      return true;
    }
  }
  return false;
}

export type PriceDropAlertCardInput = {
  brand: string;
  listingId: string;
  listingTitle: string;
  watchedPriceMinor: number;
  currentPriceMinor: number;
  dropPct: number;
  thresholdPct: number;
  currency?: string;
};

export type PriceDropAlertCard = {
  listingId: string;
  brand: string;
  listingTitle: string;
  headline: string;
  body: string;
  dropPct: number;
  watchedPriceMinor: number;
  currentPriceMinor: number;
  dismissKey: string;
};

/** Stable dismiss key for soft price-drop cards (W029). */
export function priceDropDismissKey(listingId: string, watchId?: string): string {
  return watchId ? `price-drop:${watchId}:${listingId}` : `price-drop:${listingId}`;
}

/** U008 — why the user dismissed a price-drop act card. */
export const PRICE_DROP_DISMISS_REASONS = [
  "TOO_EXPENSIVE",
  "WRONG_SIZE",
  "ALREADY_OWN",
  "NOT_INTERESTED",
  "OTHER",
] as const;

export type PriceDropDismissReason = (typeof PRICE_DROP_DISMISS_REASONS)[number];

export function isPriceDropDismissReason(value: string): value is PriceDropDismissReason {
  return (PRICE_DROP_DISMISS_REASONS as readonly string[]).includes(value);
}

/**
 * W029 — Soft vault/today card when an owned-brand watch hits threshold.
 */
export function buildPriceDropAlertCard(
  input: PriceDropAlertCardInput & { watchId?: string },
): PriceDropAlertCard {
  const drop = Math.round(input.dropPct);
  return {
    listingId: input.listingId,
    brand: input.brand,
    listingTitle: input.listingTitle,
    headline: `${input.brand} dropped ${drop}%`,
    body: `Below your ${input.thresholdPct}% watch — soft tip, not a shopping nudge.`,
    dropPct: input.dropPct,
    watchedPriceMinor: input.watchedPriceMinor,
    currentPriceMinor: input.currentPriceMinor,
    dismissKey: priceDropDismissKey(input.listingId, input.watchId),
  };
}
