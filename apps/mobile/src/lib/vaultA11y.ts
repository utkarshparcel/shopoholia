/**
 * W099 — a11y labels for vault found-money totals and expiry countdown.
 */

import { formatMinor } from '@/src/lib/format';
import type { ExpiryCountdownHero } from '@/src/lib/vaultWow';

/** Found-money total — amount + currency code for screen readers. */
export function vaultTotalA11yLabel(
  totalMinor: number,
  currency = 'INR',
): string {
  const amount = formatMinor(Math.max(0, totalMinor), currency);
  return `Found money ${amount} ${currency}`;
}

/**
 * Expiry countdown — merchant, countdown, amount+currency, and expiry date.
 */
export function vaultExpiryCountdownA11yLabel(
  hero: Pick<
    ExpiryCountdownHero,
    'merchant' | 'label' | 'heroLine' | 'expiresAt' | 'countdown'
  > & { balanceMinor?: number; currency?: string },
): string {
  const currency = hero.currency ?? 'INR';
  const parts = [hero.heroLine || `${hero.merchant} · ${hero.label}`];
  if (hero.balanceMinor != null && hero.balanceMinor > 0) {
    parts.push(`${formatMinor(hero.balanceMinor, currency)} ${currency}`);
  }
  const expiryDay = hero.expiresAt.slice(0, 10);
  if (expiryDay) {
    parts.push(
      hero.countdown.expired ? `expired ${expiryDay}` : `expires ${expiryDay}`,
    );
  }
  return parts.join('. ');
}
