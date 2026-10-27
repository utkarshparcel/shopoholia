/**
 * Privacy / data-dashboard links for TRUST-DPDP-GDPR.
 * Prefer EXPO_PUBLIC_PRIVACY_URL when the policy is published; until then
 * the draft lives at docs/legal/PRIVACY_POLICY_DRAFT.md.
 */

export const PRIVACY_POLICY_DRAFT_PATH =
  'docs/legal/PRIVACY_POLICY_DRAFT.md' as const;

export const DPDP_GDPR_CHECKLIST_PATH = 'docs/TRUST_DPDP_GDPR.md' as const;
export const PENTEST_READINESS_PATH = 'docs/PENTEST_READINESS.md' as const;

/** Suggested public URL once hosted (store listings + OAuth). */
export const PRIVACY_POLICY_DEFAULT_URL = 'https://worn.app/privacy' as const;

/** In-app privacy reader route (W081-PRIVACY-IN-APP) — no store submit required. */
export const PRIVACY_IN_APP_HREF = '/(closet)/privacy' as const;

export type DataDashboardLink = {
  id: 'privacy' | 'consent' | 'export' | 'delete';
  label: string;
  /** In-app route (expo-router) or null when action is on-screen / external. */
  href: string | null;
  url: string | null;
};

/** Resolve public privacy policy URL (env wins when https). */
export function getPrivacyPolicyUrl(
  envUrl: string | undefined = process.env.EXPO_PUBLIC_PRIVACY_URL,
): string {
  const trimmed = envUrl?.trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed;
  return PRIVACY_POLICY_DEFAULT_URL;
}

/** @deprecated Prefer getPrivacyPolicyUrl() — kept for call sites expecting a const. */
export const PRIVACY_POLICY_URL = getPrivacyPolicyUrl();

/**
 * In-app data dashboard entries shown on Vault / Consent.
 * Export + delete are on-screen actions (href null).
 */
export function getDataDashboardLinks(
  privacyUrl: string = getPrivacyPolicyUrl(),
): DataDashboardLink[] {
  return [
    {
      id: 'privacy',
      label: 'Privacy policy',
      href: PRIVACY_IN_APP_HREF,
      url: privacyUrl,
    },
    {
      id: 'consent',
      label: 'Consent & connected sources',
      href: '/(closet)/consent',
      url: null,
    },
    {
      id: 'export',
      label: 'Export my data',
      href: null,
      url: null,
    },
    {
      id: 'delete',
      label: 'Delete my account',
      href: null,
      url: null,
    },
  ];
}

export function isPrivacyPolicyUrlConfigured(url: string): boolean {
  return /^https?:\/\/\S+/i.test(url.trim());
}
