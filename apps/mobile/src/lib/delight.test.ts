import { describe, expect, it } from 'vitest';

import {
  connectCelebrationCopy,
  foundMoneyCelebrationCopy,
  foundMoneyHeadline,
  foundMoneyShareFromAccounts,
  foundMoneySubline,
  FOUND_MONEY_SHARE_WATERMARK,
  whatsAppInFoundMoneyShareFromAccounts,
} from './foundMoney';
import { morningGreeting, outfitWhyThis } from './outfitWhy';
import { returnConciergeCopy, returnCountdown } from './returnCountdown';
import { deadItemCount, neverWornCostMinor } from './wasteMoney';

describe('returnCountdown', () => {
  const now = new Date('2026-08-26T10:00:00.000Z');

  it('formats N days left', () => {
    const c = returnCountdown('2026-08-29T10:00:00.000Z', now);
    expect(c.daysLeft).toBe(3);
    expect(c.label).toBe('3 days left');
    expect(c.urgent).toBe(true);
    expect(c.expired).toBe(false);
  });

  it('singular day', () => {
    const c = returnCountdown('2026-08-27T10:00:00.000Z', now);
    expect(c.label).toBe('1 day left');
  });

  it('expired', () => {
    const c = returnCountdown('2026-08-25T10:00:00.000Z', now);
    expect(c.expired).toBe(true);
    expect(c.label).toBe('Expired');
  });
});

describe('returnConciergeCopy', () => {
  const now = new Date('2026-08-26T10:00:00.000Z');

  it('includes item context', () => {
    expect(
      returnConciergeCopy({
        deadline: '2026-08-29T10:00:00.000Z',
        itemTitle: 'navy jacket',
        now,
      }),
    ).toBe('3 days left to return navy jacket — tap to start.');
  });

  it('falls back to merchant', () => {
    expect(
      returnConciergeCopy({
        deadline: '2026-08-29T10:00:00.000Z',
        merchant: 'Myntra',
        now,
      }),
    ).toBe('3 days left to return your Myntra order — tap to start.');
  });
});

describe('foundMoney', () => {
  it('headline aha', () => {
    expect(foundMoneyHeadline(240_000)).toMatch(/forgotten credit/);
    expect(foundMoneyHeadline(240_000)).toContain('₹');
  });

  it('empty headline', () => {
    expect(foundMoneyHeadline(0)).toBe('No forgotten credit yet');
  });

  it('celebration after connect / manual / demo', () => {
    expect(connectCelebrationCopy(0)).toMatch(/Inbox connected/);
    expect(connectCelebrationCopy(5000)).toMatch(/spotted/);
    expect(foundMoneyCelebrationCopy(50_000, 'demo')).toMatch(/Sample unlocked/);
    expect(foundMoneyCelebrationCopy(50_000, 'manual')).toMatch(/Nice/);
  });

  it('subline', () => {
    expect(foundMoneySubline(0)).toMatch(/^Add a card/);
    expect(foundMoneySubline(0)).toMatch(/connect email/i);
    expect(foundMoneySubline(2)).toMatch(/2 gift cards/);
  });

  it('share card blurs merchants and watermarks worn.app', () => {
    const now = new Date('2026-08-26T10:00:00.000Z');
    const card = foundMoneyShareFromAccounts(
      [
        {
          merchant: 'Myntra',
          balanceCacheMinor: 240_000,
          expiresAt: '2026-08-29T10:00:00.000Z',
        },
        {
          merchant: 'Amazon GC 4111 1111 1111 1111',
          balanceCacheMinor: 10_000,
          expiresAt: '2026-09-10T10:00:00.000Z',
        },
      ],
      { now },
    );
    expect(card.amountLabel).toContain('₹');
    expect(card.shareText).toContain(FOUND_MONEY_SHARE_WATERMARK);
    expect(card.shareText).not.toMatch(/Myntra|Amazon/);
    expect(card.shareText).not.toMatch(/4111/);
    expect(card.daysToNearestExpiry).toBe(3);
    expect(card.blurredMerchants[0]).toBe('M••••a');
  });

  it('W023 WhatsApp IN template blurs total digits', () => {
    const wa = whatsAppInFoundMoneyShareFromAccounts(
      [{ merchant: 'Myntra', balanceCacheMinor: 240_000 }],
      { deepLink: 'https://worn.app/r/HOME01' },
    );
    expect(wa.blurredAmountLabel).not.toMatch(/\d/);
    expect(wa.shareText).not.toMatch(/Myntra/);
    expect(wa.whatsAppUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe('outfitWhyThis', () => {
  it('builds calm why-this', () => {
    const line = outfitWhyThis({
      occasion: 'CASUAL',
      weatherCtx: { tempC: 26, condition: 'sunny' },
      itemCategories: ['shirt', 'jeans'],
    });
    expect(line).toMatch(/^Why this:/);
    expect(line).toMatch(/26°C/);
    expect(line).toMatch(/shirt/);
  });

  it('morning greeting', () => {
    expect(morningGreeting(new Date('2026-08-26T08:00:00'))).toBe('Good morning');
  });
});

describe('wasteMoney', () => {
  it('sums never-worn cost', () => {
    const total = neverWornCostMinor([
      { wearCount: 0, item: { costMinor: 40_000_00 } },
      { wearCount: 2, item: { costMinor: 1000 } },
      { wearCount: 0, item: { costMinor: 500 } },
    ]);
    expect(total).toBe(40_000_00 + 500);
  });

  it('counts dead / never worn', () => {
    expect(
      deadItemCount([
        { wearCount: 0, status: 'DEAD' },
        { wearCount: 1, status: 'ACTIVE' },
      ]),
    ).toBe(1);
  });
});
