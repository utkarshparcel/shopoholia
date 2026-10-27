import { describe, expect, it } from 'vitest';

import { shoeBagNudgeCardsFromSuggestions } from './shoeBagNudge';

describe('shoeBagNudge (W067)', () => {
  it('builds nudge cards from rotation suggestions', () => {
    const cards = shoeBagNudgeCardsFromSuggestions([
      {
        id: 's1',
        category: 'sneakers',
        brand: 'Nike',
        kind: 'shoes',
        wearCount: 0,
        reason: 'Never worn shoes — good rotation pick',
      },
      {
        id: 'b1',
        category: 'tote',
        brand: null,
        kind: 'bag',
        wearCount: 1,
        reason: 'Rested 12d · worn 1×',
      },
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.headline).toMatch(/shoes/i);
    expect(cards[0]!.ctaLabel).toBe('Log a wear');
    expect(cards[1]!.kind).toBe('bag');
    expect(cards[1]!.body).toMatch(/tote/);
  });
});
