import { describe, expect, it } from 'vitest';

import { SAMPLE_MYNTRA_CREDIT } from './firstDelight';
import {
  DEMO_BADGE_LABEL,
  EMPTY_DEMO_FLAG,
  demoAccountDisplayName,
  demoGiftCardTotalMinor,
  emptyCtaTapProps,
  emptyStateCopy,
  isDemoModeActive,
  isSampleCreditAccount,
} from './emptyDemo';

describe('emptyDemo (ONB-EMPTY-DEMO + W001/W004)', () => {
  it('exposes demo mode flag key and Demo badge', () => {
    expect(EMPTY_DEMO_FLAG).toBe('closet_empty_demo');
    expect(DEMO_BADGE_LABEL).toBe('Sample');
  });

  it('isDemoModeActive tracks sample card presence', () => {
    expect(isDemoModeActive(null)).toBe(false);
    expect(isDemoModeActive({ isDemo: true, balanceCacheMinor: 50_000 })).toBe(true);
    expect(isDemoModeActive({ isDemo: false })).toBe(false);
  });

  it('isSampleCreditAccount matches local demo or Myntra ₹500 twin', () => {
    expect(isSampleCreditAccount({ isDemo: true })).toBe(true);
    expect(
      isSampleCreditAccount({
        merchant: SAMPLE_MYNTRA_CREDIT.merchant,
        balanceCacheMinor: SAMPLE_MYNTRA_CREDIT.balanceMinor,
      }),
    ).toBe(true);
    expect(
      isSampleCreditAccount({
        merchant: 'Amazon',
        balanceCacheMinor: SAMPLE_MYNTRA_CREDIT.balanceMinor,
      }),
    ).toBe(false);
  });

  it('demoGiftCardTotalMinor returns fake GC total only while demo is on', () => {
    expect(demoGiftCardTotalMinor(null)).toBe(0);
    expect(
      demoGiftCardTotalMinor({
        isDemo: true,
        balanceCacheMinor: SAMPLE_MYNTRA_CREDIT.balanceMinor,
      }),
    ).toBe(50_000);
  });

  it('marks sample merchant clearly', () => {
    expect(demoAccountDisplayName('Myntra')).toBe('Myntra (sample)');
  });

  it('personalizes empty copy per surface', () => {
    expect(emptyStateCopy('vault').demoCta).toBe(SAMPLE_MYNTRA_CREDIT.label);
    expect(emptyStateCopy('wardrobe').title).toMatch(/closet is empty/i);
    expect(emptyStateCopy('receipts').message).toMatch(/invoice/i);
    expect(emptyStateCopy('accountant').demoCta).toBeNull();
  });

  it('rotates found-money vs outfit empty copy (W004)', () => {
    const found = emptyStateCopy('vault', 'found_money');
    const outfit = emptyStateCopy('vault', 'outfit');
    expect(found.variant).toBe('found_money');
    expect(outfit.variant).toBe('outfit');
    expect(found.message).not.toBe(outfit.message);
    expect(emptyStateCopy('today', 'outfit').title).toMatch(/Dress from what you own/i);
    expect(emptyCtaTapProps('vault', 'outfit', 'demo')).toEqual({
      surface: 'vault',
      variant: 'outfit',
      cta: 'demo',
    });
  });

  it('switches vault/today strings for Hinglish pack (W091)', () => {
    const en = emptyStateCopy('vault', 'found_money', 'en');
    const hi = emptyStateCopy('vault', 'found_money', 'hinglish');
    expect(hi.title).not.toBe(en.title);
    expect(hi.message.toLowerCase()).toMatch(/gift card|vault|add/);
    const todayHi = emptyStateCopy('today', 'found_money', 'hinglish');
    expect(todayHi.title).not.toBe(emptyStateCopy('today', 'found_money', 'en').title);
  });

  it('vault empty leads with manual/sample — not Gmail', () => {
    const vault = emptyStateCopy('vault');
    expect(vault.message.toLowerCase()).toMatch(/^add a gift card/);
    expect(vault.message.toLowerCase()).not.toMatch(/^connect/);
    expect(vault.demoCta).toMatch(/sample/i);
  });

  it('returns empty mentions purchase before email', () => {
    const msg = emptyStateCopy('returns').message.toLowerCase();
    expect(msg.indexOf('purchase')).toBeLessThan(msg.indexOf('email'));
  });
});
