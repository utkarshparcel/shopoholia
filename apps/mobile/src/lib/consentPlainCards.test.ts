import { describe, expect, it } from 'vitest';

import {
  CONSENT_PLAIN_CARDS,
  CONSENT_TRUST_SCOPES,
  getConsentPlainCard,
} from './consentCenter';

describe('W073 consent plain cards', () => {
  it('exposes EMAIL / SMS / FINANCIAL in plain English', () => {
    expect(CONSENT_TRUST_SCOPES).toEqual(['EMAIL', 'SMS', 'FINANCIAL']);
    for (const scope of CONSENT_TRUST_SCOPES) {
      const card = CONSENT_PLAIN_CARDS[scope];
      expect(card.title.length).toBeGreaterThan(3);
      expect(card.summary.length).toBeGreaterThan(10);
      expect(card.detail.length).toBeGreaterThan(20);
      expect(card.title).not.toBe(scope);
      expect(card.summary.toUpperCase()).not.toBe(scope);
    }
  });

  it('resolves known scopes and rejects unknown', () => {
    expect(getConsentPlainCard('EMAIL')?.title).toBe('Email receipts');
    expect(getConsentPlainCard('SMS')?.title).toBe('Order texts');
    expect(getConsentPlainCard('FINANCIAL')?.title).toBe('Money in your Vault');
    expect(getConsentPlainCard('NOPE')).toBeNull();
  });
});
