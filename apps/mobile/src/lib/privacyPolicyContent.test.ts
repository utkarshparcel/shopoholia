import { describe, expect, it } from 'vitest';

import {
  PRIVACY_POLICY_DRAFT_BANNER,
  PRIVACY_POLICY_IN_APP_TITLE,
  PRIVACY_POLICY_SECTIONS,
  getPrivacyPolicyInAppDocument,
} from './privacyPolicyContent';

describe('privacyPolicyContent (W081-PRIVACY-IN-APP)', () => {
  it('exposes readable sections without store submit', () => {
    const doc = getPrivacyPolicyInAppDocument();
    expect(doc.title).toBe(PRIVACY_POLICY_IN_APP_TITLE);
    expect(doc.banner).toBe(PRIVACY_POLICY_DRAFT_BANNER);
    expect(doc.sections.length).toBeGreaterThanOrEqual(5);
    expect(doc.sections).toEqual([...PRIVACY_POLICY_SECTIONS]);
  });

  it('covers retention, rights, and Limited Use stance', () => {
    const joined = PRIVACY_POLICY_SECTIONS.map((s) => `${s.heading} ${s.body}`).join(
      ' ',
    );
    expect(joined).toMatch(/7 days/);
    expect(joined).toMatch(/14 days/);
    expect(joined).toMatch(/30 days/);
    expect(joined).toMatch(/export|delete/i);
    expect(joined).toMatch(/ads|AI\/ML|train/i);
    expect(joined).toMatch(/DPDP|GDPR/i);
  });
});
