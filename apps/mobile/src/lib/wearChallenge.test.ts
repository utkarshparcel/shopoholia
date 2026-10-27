import { describe, expect, it } from 'vitest';
import {
  wearChallengeCelebrateCopy,
  wearChallengeNudgeCopy,
  wearChallengeProgress,
  WEAR_CHALLENGE_TARGET,
} from './wearChallenge';

describe('wearChallenge progress counter', () => {
  it('tracks 0/3 → celebrate at 3', () => {
    expect(wearChallengeProgress(0, 'DEAD')).toMatchObject({
      eligible: true,
      progress: 0,
      target: WEAR_CHALLENGE_TARGET,
      remaining: 3,
      completed: false,
      label: '0/3 wears',
    });
    expect(wearChallengeProgress(2, 'DORMANT')).toMatchObject({
      progress: 2,
      remaining: 1,
      label: '2/3 wears',
    });
    expect(wearChallengeProgress(3, 'ACTIVE')).toMatchObject({
      eligible: false,
      completed: true,
      label: 'Challenge done — worn 3×',
    });
  });

  it('nudge + celebrate copy', () => {
    expect(wearChallengeNudgeCopy(wearChallengeProgress(0, 'DEAD'), 'navy shirt')).toMatch(
      /Wear navy shirt 3×/,
    );
    expect(wearChallengeCelebrateCopy('navy shirt')).toMatch(/navy shirt/);
  });
});
