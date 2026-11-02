/**
 * Consent and the Closet onboarding are tab screens inside the `(closet)` Tabs, so `router.back()`
 * from consent goes to the first tab (Today), not to the screen that opened it. Callers pass the
 * screen to come back to as a `returnTo` param, and consent replaces itself with that screen.
 */

export const CONSENT_HREF = '/(closet)/consent';
export const CONSENT_FALLBACK_RETURN = '/(closet)/vault';

/** Closet screens consent may return to (everything but consent itself). */
const RETURNABLE = new Set([
  'today',
  'wardrobe',
  'vault',
  'accountant',
  'recipients',
  'fit',
  'disposition',
  'swap',
  'household',
  'returns',
  'connect-email',
  'privacy',
  'family-share',
  'onboarding',
  'metrics',
  'paywall',
]);

/**
 * The Closet screen to return to, from a `returnTo` param or a pathname (`usePathname()` drops the
 * group, so `/vault` and `/(closet)/vault` are both accepted). Anything else — another surface,
 * an external URL, a query string — falls back to the Vault.
 */
export function consentReturnHref(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return CONSENT_FALLBACK_RETURN;
  const match = /^(?:\/\(closet\))?\/([a-z-]+)$/.exec(value);
  if (!match || !RETURNABLE.has(match[1])) return CONSENT_FALLBACK_RETURN;
  return `/(closet)/${match[1]}`;
}

/** Route to the consent screen that comes back to `returnTo` on approve or cancel. */
export function consentHref(
  returnTo: string = CONSENT_FALLBACK_RETURN,
  params: Record<string, string> = {},
): { pathname: typeof CONSENT_HREF; params: Record<string, string> } {
  return { pathname: CONSENT_HREF, params: { ...params, returnTo: consentReturnHref(returnTo) } };
}
