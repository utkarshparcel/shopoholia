import { describe, expect, it } from 'vitest';

import {
  GMAIL_READONLY_SCOPE,
  LIMITED_USE_BULLETS,
  LIMITED_USE_CTA_HINT,
  LIMITED_USE_NEAR_CTA_SUMMARY,
  LIMITED_USE_TITLE,
  OAUTH_CONSENT_LONG_DESCRIPTION_EN,
  assertsGmailOptionalWave1,
  getLimitedUseDisclosure,
  limitedUseVisibleNearGmailCta,
} from './limitedUse';

describe('limitedUse (TRUST-CASA-TRACK)', () => {
  it('exposes Limited Use title, bullets, and gmail.readonly scope', () => {
    const d = getLimitedUseDisclosure();
    expect(d.title).toBe(LIMITED_USE_TITLE);
    expect(d.scope).toBe(GMAIL_READONLY_SCOPE);
    expect(d.bullets.length).toBeGreaterThanOrEqual(4);
    expect(d.bullets).toEqual([...LIMITED_USE_BULLETS]);
    expect(d.ctaHint).toBe(LIMITED_USE_CTA_HINT);
    expect(d.nearCtaSummary).toBe(LIMITED_USE_NEAR_CTA_SUMMARY);
  });

  it('covers no-ads, no general ML, revoke/delete (Limited Use)', () => {
    const joined = LIMITED_USE_BULLETS.join(' ').toLowerCase();
    expect(joined).toMatch(/ads/);
    expect(joined).toMatch(/train|ml|model/);
    expect(joined).toMatch(/revoke|disconnect|delete/);
    expect(joined).toMatch(/read-only|gmail\.readonly/);
  });

  it('OAuth consent long description is English Limited Use draft', () => {
    expect(OAUTH_CONSENT_LONG_DESCRIPTION_EN).toMatch(/read-only/i);
    expect(OAUTH_CONSENT_LONG_DESCRIPTION_EN).toMatch(/ads/i);
    expect(OAUTH_CONSENT_LONG_DESCRIPTION_EN).toMatch(/revoke|delete/i);
    expect(assertsGmailOptionalWave1(OAUTH_CONSENT_LONG_DESCRIPTION_EN)).toBe(true);
  });
});

describe('limitedUse near Gmail CTA (W080-LIMITED-USE-NEAR-GMAIL)', () => {
  it('near-CTA summary is visible with Connect Gmail label', () => {
    const d = getLimitedUseDisclosure();
    expect(
      limitedUseVisibleNearGmailCta([
        d.nearCtaSummary,
        'Connect Gmail',
        d.ctaHint,
      ]),
    ).toBe(true);
  });

  it('fails when Limited Use is missing from CTA neighborhood', () => {
    expect(limitedUseVisibleNearGmailCta(['Connect Gmail', 'Skip for now'])).toBe(
      false,
    );
  });
});
