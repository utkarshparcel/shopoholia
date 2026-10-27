import { describe, expect, it } from 'vitest';
import {
  DECLUTTER_CHALLENGE_TARGET,
  buildDeclutterShareCard,
  countDisposedItems,
  declutterChallengeNudgeCopy,
  declutterChallengeProgress,
} from './declutterChallenge';

describe('declutterChallenge progress', () => {
  it('counts unique disposed listings toward goal', () => {
    expect(
      countDisposedItems([
        { wardrobeItemId: 'a', status: 'ACTIVE', mode: 'SELL' },
        { wardrobeItemId: 'a', status: 'SOLD', mode: 'SELL' },
        { wardrobeItemId: 'b', status: 'DONATED', mode: 'DONATE' },
        { wardrobeItemId: 'c', status: 'CANCELLED', mode: 'SELL' },
      ]),
    ).toBe(2);
  });

  it('tracks 0/N → complete', () => {
    expect(declutterChallengeProgress(0)).toMatchObject({
      progress: 0,
      target: DECLUTTER_CHALLENGE_TARGET,
      remaining: DECLUTTER_CHALLENGE_TARGET,
      eligible: true,
      completed: false,
    });
    expect(declutterChallengeProgress(2, { started: true, target: 3 })).toMatchObject({
      progress: 2,
      remaining: 1,
      label: '2/3 cleared',
    });
    expect(declutterChallengeProgress(3, { started: true, target: 3 })).toMatchObject({
      completed: true,
      eligible: false,
      remaining: 0,
    });
  });

  it('builds share card without brands', () => {
    const card = buildDeclutterShareCard({ progress: 2, target: 5, modes: ['SELL', 'DONATE'] });
    expect(card.shareText).toContain('worn.app');
    expect(card.modeLine).toMatch(/sell/);
    expect(card.shareText).not.toMatch(/Myntra|Zara/);
    expect(declutterChallengeNudgeCopy(declutterChallengeProgress(2, { started: true }))).toBe(
      '2/5 cleared — 3 to go.',
    );
  });
});
