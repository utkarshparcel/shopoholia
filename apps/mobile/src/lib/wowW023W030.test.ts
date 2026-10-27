/**
 * Wave A remaining vault/money acceptance smoke (W023–W030).
 */
import { describe, expect, it } from 'vitest';
import {
  barcodeSuccessFeedback,
  buildEmiDontMissCard,
  buildFamilyShareAttributionConfirm,
  buildPriceDropAlertCard,
  buildWhatsAppInFoundMoneyShare,
  formatQuietHoursNextSendPreview,
  weeklyDigestCopy,
} from '@worn/shared';

describe('W023–W030 acceptance smoke', () => {
  it('W023 WA template blurs total without merchants/digits', () => {
    const wa = buildWhatsAppInFoundMoneyShare({
      totalMinor: 12_34_00,
      accountCount: 2,
      currency: 'INR',
    });
    expect(wa.blurredAmountLabel).not.toMatch(/\d/);
    expect(wa.shareText).not.toMatch(/Myntra|Amazon/);
    expect(wa.whatsAppUrl).toContain('wa.me');
  });

  it('W024 attribution confirm shows shared via worn.app/r/', () => {
    const confirm = buildFamilyShareAttributionConfirm('HOME99');
    expect(confirm?.viaLabel).toBe('shared via worn.app/r/HOME99');
    expect(confirm?.body).not.toMatch(/Myntra|\d{4}/);
  });

  it('W025 quiet-hours preview includes next send in TZ', () => {
    const preview = formatQuietHoursNextSendPreview(
      new Date('2026-08-26T23:30:00.000Z'),
      '22:00',
      '07:00',
      { timeZone: 'UTC', locale: 'en-IN' },
    );
    expect(preview).toMatch(/Next send at/);
  });

  it('W026 digest still-have uses formatMinor framing', () => {
    const copy = weeklyDigestCopy({
      spendMinor: 10_000,
      stillHaveMinor: 240_000,
      currency: 'INR',
    });
    expect(copy.title).toMatch(/still have/i);
    expect(copy.title).toMatch(/₹|2/);
    expect(copy.body).toMatch(/vault/i);
  });

  it('W027 Reduce Motion → haptic-only (no confetti)', () => {
    expect(barcodeSuccessFeedback(true)).toMatchObject({
      mode: 'haptic_only',
      haptic: true,
      confetti: false,
    });
    expect(barcodeSuccessFeedback(false).confetti).toBe(true);
  });

  it('W029 price-drop card is soft + dismissible key', () => {
    const card = buildPriceDropAlertCard({
      brand: 'Zara',
      listingId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      listingTitle: 'Shirt',
      watchedPriceMinor: 200_000,
      currentPriceMinor: 160_000,
      dropPct: 20,
      thresholdPct: 10,
      watchId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(card.headline).toMatch(/Zara dropped/);
    expect(card.body).toMatch(/soft/i);
    expect(card.dismissKey).toContain('price-drop');
  });

  it('W030 EMI don’t-miss due within 7d + push deep link', () => {
    const card = buildEmiDontMissCard({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      provider: 'Simpl',
      merchant: 'Myntra',
      installmentMinor: 2_000_00,
      remainingMinor: 4_000_00,
      nextDueOn: '2026-08-28',
      now: new Date('2026-08-26T12:00:00.000Z'),
    });
    expect(card?.headline).toMatch(/Don't miss/i);
    expect(card?.deepLink).toMatch(/focus=emi/);
  });
});
