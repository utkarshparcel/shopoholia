/**
 * W029 — Soft price-drop alert card helpers for vault / today.
 */

import {
  buildPriceDropAlertCard,
  formatMinor,
  type PriceDropAlertCard,
  type PriceDropHit,
} from '@worn/shared';

export {
  buildPriceDropAlertCard,
  priceDropDismissKey,
  type PriceDropAlertCard,
} from '@worn/shared';

export function priceDropAlertFromHit(
  hit: Pick<
    PriceDropHit,
    | 'watchId'
    | 'listingId'
    | 'brand'
    | 'listingTitle'
    | 'watchedPriceMinor'
    | 'currentPriceMinor'
    | 'dropPct'
    | 'thresholdPct'
  >,
  currency = 'INR',
): PriceDropAlertCard & { amountLine: string } {
  const card = buildPriceDropAlertCard({
    ...hit,
    watchId: hit.watchId,
  });
  return {
    ...card,
    amountLine: `${formatMinor(hit.currentPriceMinor, currency)} (was ${formatMinor(hit.watchedPriceMinor, currency)})`,
  };
}
