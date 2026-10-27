import { afterEach, describe, expect, it } from 'vitest';

import {
  countUpMinor,
  hasFoundMoneyCountUpRun,
  markFoundMoneyCountUpRun,
  resetFoundMoneyCountUpSession,
  shouldAnimateFoundMoneyCountUp,
} from './foundMoneyCountUp';

afterEach(() => {
  resetFoundMoneyCountUpSession();
});

describe('foundMoneyCountUp (W012)', () => {
  it('animates once per session when money and motion allowed', () => {
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 50_000, reduceMotion: false }),
    ).toBe(true);
    markFoundMoneyCountUpRun();
    expect(hasFoundMoneyCountUpRun()).toBe(true);
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 50_000, reduceMotion: false }),
    ).toBe(false);
  });

  it('skips under Reduce Motion and zero totals', () => {
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 50_000, reduceMotion: true }),
    ).toBe(false);
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 0, reduceMotion: false }),
    ).toBe(false);
  });

  it('eases count-up progress', () => {
    expect(countUpMinor(0, 1000, 0)).toBe(0);
    expect(countUpMinor(0, 1000, 1)).toBe(1000);
    const mid = countUpMinor(0, 1000, 0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
  });
});
