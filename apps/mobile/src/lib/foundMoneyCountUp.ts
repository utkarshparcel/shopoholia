/**
 * W012 — Found-money total count-up (once per session; Reduce Motion skips).
 */

let animatedThisSession = false;

export function resetFoundMoneyCountUpSession(): void {
  animatedThisSession = false;
}

export function hasFoundMoneyCountUpRun(): boolean {
  return animatedThisSession;
}

export function markFoundMoneyCountUpRun(): void {
  animatedThisSession = true;
}

export type CountUpEligibility = {
  totalMinor: number;
  reduceMotion: boolean;
  alreadyAnimatedThisSession?: boolean;
};

/** Animate once per session when there is money and motion is allowed. */
export function shouldAnimateFoundMoneyCountUp(opts: CountUpEligibility): boolean {
  const already =
    opts.alreadyAnimatedThisSession ?? animatedThisSession;
  if (opts.totalMinor <= 0) return false;
  if (opts.reduceMotion) return false;
  if (already) return false;
  return true;
}

/** Ease-out quad progress 0→1 → interpolated minor units. */
export function countUpMinor(fromMinor: number, toMinor: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - clamped) * (1 - clamped);
  return Math.round(fromMinor + (toMinor - fromMinor) * eased);
}

export const FOUND_MONEY_COUNTUP_MS = 900;
