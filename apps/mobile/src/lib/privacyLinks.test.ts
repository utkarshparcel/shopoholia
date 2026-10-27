import { describe, expect, it } from 'vitest';

import {
  DPDP_GDPR_CHECKLIST_PATH,
  getDataDashboardLinks,
  getPrivacyPolicyUrl,
  isPrivacyPolicyUrlConfigured,
  PENTEST_READINESS_PATH,
  PRIVACY_IN_APP_HREF,
  PRIVACY_POLICY_DEFAULT_URL,
  PRIVACY_POLICY_DRAFT_PATH,
} from './privacyLinks';

describe('privacyLinks (TRUST-DPDP-GDPR)', () => {
  it('uses env URL when https', () => {
    expect(getPrivacyPolicyUrl('https://worn.app/privacy')).toBe(
      'https://worn.app/privacy',
    );
  });

  it('falls back to default when env missing or invalid', () => {
    expect(getPrivacyPolicyUrl(undefined)).toBe(PRIVACY_POLICY_DEFAULT_URL);
    expect(getPrivacyPolicyUrl('')).toBe(PRIVACY_POLICY_DEFAULT_URL);
    expect(getPrivacyPolicyUrl('not-a-url')).toBe(PRIVACY_POLICY_DEFAULT_URL);
  });

  it('data dashboard includes policy, consent, export, delete', () => {
    const links = getDataDashboardLinks('https://example.com/privacy');
    expect(links.map((l) => l.id)).toEqual([
      'privacy',
      'consent',
      'export',
      'delete',
    ]);
    expect(links.find((l) => l.id === 'privacy')?.url).toBe(
      'https://example.com/privacy',
    );
    expect(links.find((l) => l.id === 'privacy')?.href).toBe(PRIVACY_IN_APP_HREF);
    expect(links.find((l) => l.id === 'consent')?.href).toContain('consent');
    expect(PRIVACY_POLICY_DRAFT_PATH).toBe('docs/legal/PRIVACY_POLICY_DRAFT.md');
    expect(DPDP_GDPR_CHECKLIST_PATH).toBe('docs/TRUST_DPDP_GDPR.md');
    expect(PENTEST_READINESS_PATH).toBe('docs/PENTEST_READINESS.md');
  });

  it('detects configured https URLs', () => {
    expect(isPrivacyPolicyUrlConfigured('https://x.test/p')).toBe(true);
    expect(isPrivacyPolicyUrlConfigured('')).toBe(false);
  });
});
