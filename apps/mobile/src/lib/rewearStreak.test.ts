import { describe, expect, it } from 'vitest';
import {
  computeRewearStreak,
  rewearStreakNudgeCopy,
  toUtcDateKey,
} from './rewearStreak';

function day(offset: number, now = new Date('2026-08-26T15:00:00.000Z')): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + offset);
  return `${toUtcDateKey(d)}T12:00:00.000Z`;
}

describe('rewearStreak mobile helper', () => {
  it('counts consecutive rewear days', () => {
    const now = new Date('2026-08-26T15:00:00.000Z');
    const streak = computeRewearStreak({
      wearDates: [day(-2, now), day(-1, now), day(0, now)],
      now,
    });
    expect(streak.currentStreak).toBe(3);
    expect(rewearStreakNudgeCopy(streak)).toMatch(/keep rewearing/i);
  });
});
