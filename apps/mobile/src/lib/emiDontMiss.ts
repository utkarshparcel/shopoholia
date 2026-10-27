/**
 * W030 — EMI due “don’t miss” card helpers.
 */

import {
  buildEmiDontMissCard,
  formatMinor,
  type EmiDontMissCard,
  type EmiPlan,
} from '@worn/shared';

export {
  buildEmiDontMissCard,
  emiDueWithinDays,
  emiDaysUntilDue,
  type EmiDontMissCard,
} from '@worn/shared';

export function emiDontMissCardsFromPlans(
  plans: EmiPlan[],
  now: Date = new Date(),
): Array<EmiDontMissCard & { installmentLabel: string }> {
  const out: Array<EmiDontMissCard & { installmentLabel: string }> = [];
  for (const p of plans) {
    const card = buildEmiDontMissCard({
      id: p.id,
      provider: p.provider,
      merchant: p.merchant,
      installmentMinor: p.installmentMinor,
      remainingMinor: p.remainingMinor,
      nextDueOn: p.nextDueOn,
      currency: p.currency,
      now,
    });
    if (!card) continue;
    out.push({
      ...card,
      installmentLabel: formatMinor(card.installmentMinor, card.currency),
    });
  }
  return out;
}
