import { describe, expect, it } from 'vitest';

import {
  PRIVACY_POLICY_BANNER,
  PRIVACY_POLICY_IN_APP_TITLE,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_SUBPROCESSORS,
  getPrivacyPolicyInAppDocument,
} from './privacyPolicyContent';

describe('privacyPolicyContent (W081-PRIVACY-IN-APP)', () => {
  it('exposes readable sections without store submit', () => {
    const doc = getPrivacyPolicyInAppDocument();
    expect(doc.title).toBe(PRIVACY_POLICY_IN_APP_TITLE);
    expect(doc.banner).toBe(PRIVACY_POLICY_BANNER);
    expect(doc.banner).not.toMatch(/draft|legal advice|counsel/i);
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

  it('names every outside service the code sends data to, and what each gets (Plan #13)', () => {
    const names = PRIVACY_POLICY_SUBPROCESSORS.map((p) => p.name);
    for (const expected of [
      'Cloudflare R2',
      'FASHN',
      'Google Gmail API',
      'Sentry',
      'PostHog',
      'Expo push service',
      'Apple (App Store)',
      'Google (Play Billing and the Play Developer API)',
    ]) {
      expect(names).toContain(expected);
    }
    expect(names.join(' ')).not.toMatch(/RevenueCat|Razorpay/);
    for (const p of PRIVACY_POLICY_SUBPROCESSORS) expect(p.receives.length).toBeGreaterThan(10);
    const stores = PRIVACY_POLICY_SUBPROCESSORS.filter((p) => /App Store|Play Billing/.test(p.name));
    for (const p of stores) expect(p.receives).toMatch(/Purchase records.*Nothing else/);
  });
});
