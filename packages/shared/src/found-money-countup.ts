/**
 * W012 — pure found-money total count-up helpers (animation-agnostic).
 * UI owns RAF/Reanimated; this module owns ease + formatMinor frames.
 */

import { localeForCurrency } from "./currency-prefs.js";
import { DEFAULT_CURRENCY, formatMinor } from "./money.js";

/** Default hero count-up duration. */
export const FOUND_MONEY_COUNTUP_DURATION_MS = 900;

/** Session flag key hint for "animated once per session". */
export const FOUND_MONEY_COUNTUP_SESSION_KEY = "found_money_countup_done";

/** Skip motion under Reduce Motion (acceptance: W012). */
export function shouldSkipFoundMoneyCountUp(reduceMotion: boolean): boolean {
  return reduceMotion;
}

/** Ease-out cubic in [0, 1]. */
export function countUpEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Progress 0→1 from elapsed time. */
export function countUpProgress(
  elapsedMs: number,
  durationMs = FOUND_MONEY_COUNTUP_DURATION_MS,
): number {
  if (durationMs <= 0) return 1;
  return countUpEase(elapsedMs / durationMs);
}

/** Interpolate integer minor units for a frame. */
export function countUpMinor(
  fromMinor: number,
  toMinor: number,
  progress: number,
): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(fromMinor + (toMinor - fromMinor) * p);
}

/**
 * Format a count-up frame via `formatMinor`.
 * When Reduce Motion, callers should jump to `toMinor` directly.
 */
export function formatCountUpFrame(
  fromMinor: number,
  toMinor: number,
  progress: number,
  currency = DEFAULT_CURRENCY,
  locale?: string,
): string {
  const minor = countUpMinor(fromMinor, toMinor, progress);
  return formatMinor(
    minor,
    currency,
    locale ?? localeForCurrency(currency),
  );
}

/**
 * Reveal policy for vault hero total.
 * Count-up skipped under Reduce Motion; final label still uses formatMinor.
 */
export function foundMoneyCountUpPlan(input: {
  toMinor: number;
  fromMinor?: number;
  reduceMotion: boolean;
  alreadyPlayedThisSession: boolean;
  currency?: string;
  locale?: string;
}): {
  animate: boolean;
  fromMinor: number;
  toMinor: number;
  durationMs: number;
  finalLabel: string;
} {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const locale = input.locale ?? localeForCurrency(currency);
  const fromMinor = input.fromMinor ?? 0;
  const animate =
    !shouldSkipFoundMoneyCountUp(input.reduceMotion) &&
    !input.alreadyPlayedThisSession &&
    input.toMinor !== fromMinor;

  return {
    animate,
    fromMinor,
    toMinor: input.toMinor,
    durationMs: animate ? FOUND_MONEY_COUNTUP_DURATION_MS : 0,
    finalLabel: formatMinor(input.toMinor, currency, locale),
  };
}
