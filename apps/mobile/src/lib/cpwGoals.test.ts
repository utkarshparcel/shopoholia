import { describe, expect, it } from 'vitest';
import {
  cpwGoalCelebrateCopy,
  cpwGoalNudgeCopy,
  cpwGoalProgress,
  wearsNeededForTargetCpw,
} from './cpwGoals';

describe('cpwGoals (N41)', () => {
  it('goal math: wears needed + progress', () => {
    expect(wearsNeededForTargetCpw(500_000, 50_000)).toBe(10);
    expect(cpwGoalProgress(500_000, 3, 50_000)).toMatchObject({
      progress: 3,
      remaining: 7,
      wearsNeeded: 10,
      completed: false,
    });
    expect(cpwGoalProgress(500_000, 10, 50_000).completed).toBe(true);
  });

  it('nudge copy', () => {
    expect(cpwGoalNudgeCopy(cpwGoalProgress(500_000, 0, 50_000), 'kurta')).toMatch(/Wear kurta/);
    expect(cpwGoalCelebrateCopy('kurta')).toMatch(/kurta/);
  });
});
