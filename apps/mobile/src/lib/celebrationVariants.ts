/**
 * W007 — first-credit celebration variants by source (manual / oauth / demo).
 * Copy stays honest; haptics distinct; Reduce Motion handled by delightHaptics.
 */

import type { DelightSource } from '@/src/lib/firstDelight';
import { formatMinor } from '@/src/lib/format';
import type { ClosetCurrency } from '@/src/lib/closetPrefs';

export type CelebrationVariant = {
  source: DelightSource;
  /** Short eyebrow above the body (vault banner). */
  eyebrow: string;
  /** Primary celebration body. */
  body: string;
  /** Haptic intensity — demo is lighter so sample never oversells. */
  haptic: 'light' | 'medium';
};

export function celebrationEyebrow(source: DelightSource): string {
  switch (source) {
    case 'demo':
      return 'Sample only';
    case 'manual':
      return 'Card saved';
    case 'oauth':
      return 'Inbox connected';
    default:
      return 'Found money';
  }
}

export function celebrationHapticForSource(
  source: DelightSource,
): 'light' | 'medium' {
  return source === 'demo' ? 'light' : 'medium';
}

/**
 * Distinct celebration copy per source. Demo never claims real money.
 */
export function celebrationVariantForSource(
  totalMinor: number,
  source: DelightSource,
  currency: ClosetCurrency | string = 'INR',
): CelebrationVariant {
  const amount = formatMinor(Math.max(totalMinor, 0), currency);
  const haptic = celebrationHapticForSource(source);

  if (source === 'demo') {
    return {
      source,
      eyebrow: celebrationEyebrow(source),
      body: `Sample unlocked — ${formatMinor(Math.max(totalMinor, 50_000), currency)} Myntra credit is in your vault. Not real money — add a real card anytime.`,
      haptic,
    };
  }

  if (source === 'manual') {
    return {
      source,
      eyebrow: celebrationEyebrow(source),
      body:
        totalMinor > 0
          ? `Nice — ${amount} is now in your vault. Spend it before it expires.`
          : 'Card saved. Your found money lives here.',
      haptic,
    };
  }

  return {
    source: 'oauth',
    eyebrow: celebrationEyebrow('oauth'),
    body:
      totalMinor > 0
        ? `Inbox connected. We already spotted ${amount} — spend it before it expires.`
        : 'Inbox connected. We’re scanning for gift cards, returns, and warranties — check back in a moment.',
    haptic,
  };
}
