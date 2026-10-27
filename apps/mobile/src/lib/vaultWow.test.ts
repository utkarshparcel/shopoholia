import { describe, expect, it } from 'vitest';

import {
  applySoonestFocusMode,
  balanceRecheckNudgeCopy,
  deeplinkSuccessToastCopy,
  expiryActionChecklist,
  expiryCountdownHero,
  filterSoonestFocus,
  groupVaultBalancesByCurrency,
  isExpiryHeroFocus,
  loyaltyFirstCelebrationCopy,
  loyaltyTabEmptyCopy,
  multiCardStackA11yLabel,
  multiCardStackLayers,
  nextSaturdayMorning,
  preferredCurrencyTotalMinor,
  shouldPlayVaultDelight,
  shouldShowBalanceRecheckNudge,
  shouldShowDeeplinkSuccessToast,
  shouldShowMultiCardStack,
  shouldShowWeekendChip,
  shouldSoftBlockStaleUseNow,
  soonestExpiringAccount,
  sortBySoonestExpiry,
  suggestVaultCreditMerges,
  VAULT_EXPIRY_HREF,
  weekendReminderCalendarUrl,
} from './vaultWow';

const now = new Date('2026-08-26T10:00:00.000Z'); // Wednesday

const accounts = [
  {
    id: 'a1',
    merchant: 'Myntra',
    expiresAt: '2026-08-29T10:00:00.000Z',
    balanceCacheMinor: 50_000,
    currency: 'INR',
  },
  {
    id: 'a2',
    merchant: 'Amazon',
    expiresAt: '2026-08-27T12:00:00.000Z',
    balanceCacheMinor: 20_000,
    currency: 'INR',
  },
  {
    id: 'a3',
    merchant: 'Nykaa',
    expiresAt: null,
    balanceCacheMinor: 10_000,
    currency: 'INR',
  },
];

describe('W016 expiry countdown hero', () => {
  it('picks soonest future expiry', () => {
    const soonest = soonestExpiringAccount(accounts, now);
    expect(soonest?.merchant).toBe('Amazon');
  });

  it('builds days/hours hero line', () => {
    const hero = expiryCountdownHero(accounts, now);
    expect(hero?.label).toBe('2 days left');
    expect(hero?.heroLine).toBe('Amazon · 2 days left');
    expect(hero?.countdown.hoursLeft).toBeNull();
  });

  it('switches to hours under 24h', () => {
    const hero = expiryCountdownHero(
      [
        {
          id: 'h',
          merchant: 'Ajio',
          expiresAt: '2026-08-26T15:00:00.000Z',
          balanceCacheMinor: 1000,
        },
      ],
      now,
    );
    expect(hero?.label).toBe('5 hours left');
    expect(hero?.countdown.hoursLeft).toBe(5);
  });

  it('treats found-money and expiry focus as hero landings', () => {
    expect(isExpiryHeroFocus('found-money')).toBe(true);
    expect(isExpiryHeroFocus('expiry')).toBe(true);
    expect(isExpiryHeroFocus('returns')).toBe(false);
    expect(VAULT_EXPIRY_HREF.params.focus).toBe('expiry');
  });
});

describe('W017 use this weekend', () => {
  it('computes next Saturday morning', () => {
    const sat = nextSaturdayMorning(now, 10);
    expect(sat.getUTCDay()).toBe(6);
    expect(sat.getUTCHours()).toBe(10);
  });

  it('builds calendar URL without card digits', () => {
    const url = weekendReminderCalendarUrl('Myntra', now);
    expect(url).toContain('calendar.google.com');
    expect(url).toContain('Use%20Myntra');
    expect(url).not.toMatch(/\d{12,}/);
  });

  it('hides chip when expired or zero balance', () => {
    expect(
      shouldShowWeekendChip(
        { balanceCacheMinor: 100, expiresAt: '2026-08-20T00:00:00.000Z' },
        now,
      ),
    ).toBe(false);
    expect(
      shouldShowWeekendChip({ balanceCacheMinor: 0, expiresAt: null }, now),
    ).toBe(false);
    expect(
      shouldShowWeekendChip({ balanceCacheMinor: 100, expiresAt: null }, now),
    ).toBe(true);
  });
});

describe('W018 deeplink success toast', () => {
  it('copy has no PII', () => {
    const copy = deeplinkSuccessToastCopy();
    expect(copy).toMatch(/Merchant opened/);
    expect(copy).not.toMatch(/@/);
    expect(copy).not.toMatch(/\d{4}/);
  });

  it('requires dwell after open', () => {
    expect(shouldShowDeeplinkSuccessToast(null, 1000)).toBe(false);
    expect(
      shouldShowDeeplinkSuccessToast({ openedAt: 1000, platform: 'myntra' }, 1200),
    ).toBe(false);
    expect(
      shouldShowDeeplinkSuccessToast({ openedAt: 1000, platform: 'myntra' }, 2000),
    ).toBe(true);
  });
});

describe('W019 multi-card stack', () => {
  it('shows for ≥3', () => {
    expect(shouldShowMultiCardStack(2)).toBe(false);
    expect(shouldShowMultiCardStack(3)).toBe(true);
  });

  it('a11y label includes total', () => {
    const label = multiCardStackA11yLabel(80_000, 3);
    expect(label).toMatch(/3 credits/);
    expect(label).toContain('₹');
  });

  it('layers soonest first', () => {
    const layers = multiCardStackLayers(accounts, 3, now);
    expect(layers[0]?.merchant).toBe('Amazon');
    expect(layers).toHaveLength(3);
  });
});

describe('W020 soonest focus mode', () => {
  it('sorts expiry ASC with nulls last', () => {
    const sorted = sortBySoonestExpiry(accounts, now);
    expect(sorted.map((a) => a.merchant)).toEqual(['Amazon', 'Myntra', 'Nykaa']);
  });

  it('filters to dated accounts when enabled', () => {
    expect(filterSoonestFocus(accounts)).toHaveLength(2);
    const focused = applySoonestFocusMode(accounts, true, now);
    expect(focused.map((a) => a.merchant)).toEqual(['Amazon', 'Myntra']);
    expect(applySoonestFocusMode(accounts, false, now)).toHaveLength(3);
  });
});

describe('W021 balance recheck UX', () => {
  it('builds nudge copy', () => {
    const c = balanceRecheckNudgeCopy('Amazon');
    expect(c.recheckCta).toBe('Recheck balance');
    expect(c.remindCta).toMatch(/Remind/);
    expect(shouldShowBalanceRecheckNudge(true)).toBe(true);
    expect(shouldShowBalanceRecheckNudge(false)).toBe(false);
  });

  it('U004 soft-blocks stale Use it now', () => {
    expect(shouldSoftBlockStaleUseNow(true)).toBe(true);
    expect(shouldSoftBlockStaleUseNow(false)).toBe(false);
  });
});

describe('U002 / U003 / U005 vault money-truth helpers', () => {
  it('suggests merge for same merchant+currency', () => {
    const suggestions = suggestVaultCreditMerges([
      {
        id: '1',
        merchant: 'Myntra',
        currency: 'INR',
        kind: 'GIFT_CARD',
        balanceCacheMinor: 3000,
      },
      {
        id: '2',
        merchant: 'Myntra',
        currency: 'INR',
        kind: 'GIFT_CARD',
        balanceCacheMinor: 1000,
      },
      {
        id: '3',
        merchant: 'Amazon',
        currency: 'INR',
        kind: 'GIFT_CARD',
        balanceCacheMinor: 500,
      },
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.targetAccountId).toBe('1');
    expect(suggestions[0]!.sourceAccountId).toBe('2');
  });

  it('builds expiry checklist when ≤7d', () => {
    const checklist = expiryActionChecklist(
      {
        merchant: 'Myntra',
        expiresAt: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
        link: 'https://www.myntra.com/',
        balanceCacheMinor: 500,
      },
      now,
    );
    expect(checklist).toHaveLength(3);
    expect(checklist!.map((a) => a.id)).toEqual(['use', 'transfer', 'sell']);
    expect(
      expiryActionChecklist(
        {
          merchant: 'Myntra',
          expiresAt: new Date(now.getTime() + 20 * 86_400_000).toISOString(),
          balanceCacheMinor: 500,
        },
        now,
      ),
    ).toBeNull();
  });

  it('groups balances by currency without silent FX', () => {
    const accounts = [
      { currency: 'INR', balanceCacheMinor: 1000 },
      { currency: 'USD', balanceCacheMinor: 500 },
      { currency: 'INR', balanceCacheMinor: 200 },
    ];
    expect(groupVaultBalancesByCurrency(accounts)).toEqual([
      { currency: 'INR', totalMinor: 1200, count: 2 },
      { currency: 'USD', totalMinor: 500, count: 1 },
    ]);
    expect(preferredCurrencyTotalMinor(accounts, 'INR')).toBe(1200);
    expect(preferredCurrencyTotalMinor(accounts, 'USD')).toBe(500);
  });
});

describe('W022 loyalty tab delight', () => {
  it('empty + first celebration', () => {
    expect(loyaltyTabEmptyCopy('loyalty').cta).toMatch(/loyalty/i);
    expect(loyaltyTabEmptyCopy('coupons').title).toMatch(/coupon/i);
    expect(loyaltyFirstCelebrationCopy(12_000, 'loyalty')).toMatch(/First points/);
    expect(loyaltyFirstCelebrationCopy(500, 'coupons')).toMatch(/Coupon saved/);
  });

  it('respects Reduce Motion', () => {
    expect(shouldPlayVaultDelight(true)).toBe(false);
    expect(shouldPlayVaultDelight(false)).toBe(true);
  });
});
