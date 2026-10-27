import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginClosetColdStart,
  CLOSET_TTI_BUDGET_MS,
  isClosetSecondaryReady,
  isClosetTtiWithinBudget,
  markClosetInteractive,
  resetClosetColdStart,
  scheduleClosetSecondaryFetches,
} from './closetColdStart';

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('react-native', () => ({
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => {
      cb();
      return { cancel: () => undefined };
    },
  },
}));

describe('closetColdStart (W095)', () => {
  afterEach(() => {
    resetClosetColdStart();
  });

  it('budgets TTI under 2s', () => {
    expect(CLOSET_TTI_BUDGET_MS).toBe(2000);
    expect(isClosetTtiWithinBudget(1999)).toBe(true);
    expect(isClosetTtiWithinBudget(2000)).toBe(true);
    expect(isClosetTtiWithinBudget(2001)).toBe(false);
  });

  it('measures TTI once from begin → interactive', async () => {
    const { trackEvent } = await import('@/src/lib/analytics');
    beginClosetColdStart(1_000);
    const report = markClosetInteractive('today', 1_450);
    expect(report).toEqual({
      screen: 'today',
      ttiMs: 450,
      withinBudget: true,
    });
    expect(trackEvent).toHaveBeenCalledWith(
      'closet_cold_start_tti',
      expect.objectContaining({ tti_ms: 450, within_budget: true }),
    );
    expect(markClosetInteractive('today', 2_000)).toBeNull();
  });

  it('defers secondary fetches until after interactions', () => {
    expect(isClosetSecondaryReady()).toBe(false);
    scheduleClosetSecondaryFetches();
    expect(isClosetSecondaryReady()).toBe(true);
  });
});
