import { describe, expect, it } from 'vitest';

import { emiDontMissCardsFromPlans } from './emiDontMiss';
import type { EmiPlan } from '@worn/shared';

const base: EmiPlan = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  userId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  provider: 'Simpl',
  merchant: 'Myntra',
  principalMinor: 10_000_00,
  remainingMinor: 4_000_00,
  installmentMinor: 2_000_00,
  nextDueOn: '2026-08-28',
  currency: 'INR',
  status: 'ACTIVE',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('emiDontMiss (W030)', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');

  it('surfaces due-within-7d plans with mark-paid framing', () => {
    const cards = emiDontMissCardsFromPlans([base], now);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.headline).toMatch(/Don't miss/i);
    expect(cards[0]!.installmentLabel).toContain('₹');
    expect(cards[0]!.deepLink).toContain('focus=emi');
  });

  it('skips far-out dues', () => {
    expect(
      emiDontMissCardsFromPlans([{ ...base, nextDueOn: '2026-10-01' }], now),
    ).toEqual([]);
  });
});
