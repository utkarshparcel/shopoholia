/**
 * Google Limited Use disclosures for Gmail OAuth (TRUST-CASA-TRACK).
 *
 * Shown in-app before Connect Gmail and on the consent center.
 * OAuth consent screen long description mirrors docs/CASA.md.
 */

export const GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly' as const;

/** Section title above Limited Use bullets (connect-email / consent). */
export const LIMITED_USE_TITLE = 'Google Limited Use';

/**
 * In-app bullets — purpose limitation, no ads, no general ML, human access,
 * revoke/delete. Keep aligned with docs/CASA.md.
 */
export const LIMITED_USE_BULLETS = [
  'Read-only Gmail (gmail.readonly): we scan purchase and shipping emails for gift cards, store credit, returns, and warranties — not your personal messages or sent mail.',
  'We do not use your inbox for ads, ad personalization, or selling data to third parties.',
  'We do not train general AI/ML models on your mailbox content.',
  'No human reads your mail except with your consent, for security/abuse cases, or as required by law.',
  'Disconnect Gmail anytime. Export or permanently delete your Vault data from Consent or Vault.',
] as const;

/** Short line under Connect Gmail CTA. */
export const LIMITED_USE_CTA_HINT =
  'By connecting Gmail you agree we process purchase emails under Google Limited Use — revoke anytime.';

/**
 * Compact block shown immediately above Connect Gmail (W080-LIMITED-USE-NEAR-GMAIL).
 * Full bullets may appear earlier; this strip must stay adjacent to the CTA.
 */
export const LIMITED_USE_NEAR_CTA_SUMMARY =
  'Google Limited Use: read-only purchase mail only — no ads, no general ML training. Revoke anytime.';

/** Draft long description for GCP OAuth consent screen (EN). */
export const OAUTH_CONSENT_LONG_DESCRIPTION_EN =
  'WORN Closet scans purchase and shipping emails (read-only) to surface gift cards, store credit, return windows, and warranties you already paid for. We do not send email, change Gmail settings, use inbox data for ads, or train general ML models on your mail. You can revoke access and export or delete your data anytime.';

export type LimitedUseDisclosure = {
  title: string;
  bullets: readonly string[];
  ctaHint: string;
  nearCtaSummary: string;
  scope: typeof GMAIL_READONLY_SCOPE;
};

export function getLimitedUseDisclosure(): LimitedUseDisclosure {
  return {
    title: LIMITED_USE_TITLE,
    bullets: LIMITED_USE_BULLETS,
    ctaHint: LIMITED_USE_CTA_HINT,
    nearCtaSummary: LIMITED_USE_NEAR_CTA_SUMMARY,
    scope: GMAIL_READONLY_SCOPE,
  };
}

/** True when Limited Use copy is present in the Gmail CTA neighborhood strings. */
export function limitedUseVisibleNearGmailCta(parts: readonly string[]): boolean {
  const joined = parts.join(' ').toLowerCase();
  return (
    joined.includes('limited use') &&
    (joined.includes('connect gmail') || joined.includes('gmail')) &&
    (joined.includes('read-only') || joined.includes('readonly') || joined.includes('revoke'))
  );
}

/** True when copy still asserts Wave-1 paths need no CASA/Gmail verification. */
export function assertsGmailOptionalWave1(copy: string): boolean {
  const lower = copy.toLowerCase();
  return (
    lower.includes('revoke') &&
    (lower.includes('read-only') || lower.includes('readonly') || lower.includes('gmail.readonly'))
  );
}
