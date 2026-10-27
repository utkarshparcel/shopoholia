/**
 * <60s Closet first-delight helpers.
 *
 * Pure routing / timing utilities — Play surface never imports these for
 * post-auth decisions. Closet entry (toggle / restore) consults them.
 */

export const SAMPLE_MYNTRA_CREDIT = {
  kind: 'GIFT_CARD' as const,
  merchant: 'Myntra',
  currency: 'INR',
  /** ₹500 in minor units. */
  balanceMinor: 50_000,
  label: 'Try with sample ₹500 Myntra credit',
} as const;

export const VAULT_FOUND_MONEY_HREF = {
  pathname: '/(closet)/vault' as const,
  params: { focus: 'found-money' as const },
};

/** W016 — push / deep link → vault soonest-expiry countdown hero. */
export const VAULT_EXPIRY_HREF = {
  pathname: '/(closet)/vault' as const,
  params: { focus: 'expiry' as const },
};

/** Deep link / returns.tsx alias → Vault Returns tab (WV01-MOBILE-UNIFY). */
export const VAULT_RETURNS_HREF = {
  pathname: '/(closet)/vault' as const,
  params: { focus: 'returns' as const },
};

export type DelightSource = 'manual' | 'oauth' | 'demo';

export type FirstDelightSnapshot = {
  featureCloset: boolean;
  /** True once any money_accounts (or local demo) exist. */
  hasMoneyAccounts: boolean;
  /** True once any consent grant exists (EMAIL / FINANCIAL / …). */
  hasAnyConsent: boolean;
  onboardingSkipped: boolean;
  onboardingCompleted: boolean;
};

/** Compact onboarding when Closet is on and the user has no vault yet. */
export function needsClosetOnboarding(s: FirstDelightSnapshot): boolean {
  if (!s.featureCloset) return false;
  if (s.onboardingSkipped || s.onboardingCompleted) return false;
  if (s.hasMoneyAccounts || s.hasAnyConsent) return false;
  return true;
}

/** Closet landing after auth / surface switch. Play stays on feed/avatar. */
export function closetEntryHref(s: FirstDelightSnapshot): '/(closet)/onboarding' | '/(closet)/today' {
  return needsClosetOnboarding(s) ? '/(closet)/onboarding' : '/(closet)/today';
}

export function secondsSince(startedAt: number | null, now = Date.now()): number | null {
  if (startedAt == null || !Number.isFinite(startedAt)) return null;
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

/**
 * Props for W008 skip-path events (`onboarding_skipped`, `email_prompt_skipped`).
 * Uses delight clock when present; otherwise `seconds: 0` so sinks always get `{seconds}`.
 */
export function skipPathSecondsProps(
  startedAt: number | null,
  now = Date.now(),
): { seconds: number } {
  return { seconds: secondsSince(startedAt, now) ?? 0 };
}

/** Properties for `time_to_found_money` — only fire once per session flag. */
export function timeToFoundMoneyProps(
  startedAt: number | null,
  source: DelightSource,
  now = Date.now(),
): { seconds: number; source: DelightSource } | null {
  const seconds = secondsSince(startedAt, now);
  if (seconds == null) return null;
  return { seconds, source };
}

/** W008 — skip-path analytics always include elapsed seconds (0 if clock unset). */
export function skipPathAnalyticsProps(
  startedAt: number | null,
  now = Date.now(),
): { seconds: number } {
  return { seconds: secondsSince(startedAt, now) ?? 0 };
}

/** W001 — demo exit analytics (no PII). */
export function demoExitedProps(
  startedAt: number | null,
  now = Date.now(),
): { seconds: number; source: 'demo' } {
  return { seconds: secondsSince(startedAt, now) ?? 0, source: 'demo' };
}
