import { describe, expect, it } from 'vitest';

import { buildRewearCelebrate, shouldAnimateRewearCelebrate } from './rewearCelebrate';

describe('rewearCelebrate (W072)', () => {
  it('celebrates milestones and respects Reduce Motion', () => {
    expect(shouldAnimateRewearCelebrate(true)).toBe(false);
    expect(shouldAnimateRewearCelebrate(false)).toBe(true);

    const miss = buildRewearCelebrate(2, false);
    expect(miss.celebrate).toBe(false);
    expect(miss.animate).toBe(false);

    const hit = buildRewearCelebrate(7, false);
    expect(hit.celebrate).toBe(true);
    expect(hit.animate).toBe(true);
    expect(hit.copy).toMatch(/7-day rewear streak/i);

    const quiet = buildRewearCelebrate(7, true);
    expect(quiet.celebrate).toBe(true);
    expect(quiet.animate).toBe(false);
    expect(quiet.copy).toMatch(/Habit > haul/i);
  });
});
