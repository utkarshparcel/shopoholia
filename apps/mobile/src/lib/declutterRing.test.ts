import { describe, expect, it } from 'vitest';

import {
  declutterRingDegrees,
  declutterRingLabel,
  declutterRingRatio,
} from './declutterRing';

describe('declutterRing (W071)', () => {
  it('computes N/goal ratio and label', () => {
    expect(declutterRingRatio(0, 5)).toBe(0);
    expect(declutterRingRatio(2, 5)).toBe(0.4);
    expect(declutterRingRatio(5, 5)).toBe(1);
    expect(declutterRingRatio(9, 5)).toBe(1);
    expect(declutterRingRatio(1, 0)).toBe(0);
    expect(declutterRingDegrees(1, 4)).toBe(90);
    expect(declutterRingLabel(2, 5)).toBe('2/5');
    expect(declutterRingLabel(7, 5)).toBe('5/5');
  });
});
