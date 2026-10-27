/**
 * W072 — rewear streak milestone celebration (Reduce Motion safe).
 */

import {
  isRewearStreakMilestone,
  rewearStreakCelebrateCopy,
} from '@/src/lib/rewearStreak';

export type RewearCelebrateModel = {
  /** Show celebrate banner (milestone hit). */
  celebrate: boolean;
  /** Animate / haptic — false when Reduce Motion. */
  animate: boolean;
  copy: string;
  currentStreak: number;
};

export function shouldAnimateRewearCelebrate(reduceMotion: boolean): boolean {
  return !reduceMotion;
}

export function buildRewearCelebrate(
  currentStreak: number,
  reduceMotion: boolean,
): RewearCelebrateModel {
  const celebrate = isRewearStreakMilestone(currentStreak);
  return {
    celebrate,
    animate: celebrate && shouldAnimateRewearCelebrate(reduceMotion),
    copy: celebrate ? rewearStreakCelebrateCopy(currentStreak) : '',
    currentStreak,
  };
}
