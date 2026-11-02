import { describe, expect, it } from 'vitest';

import {
  CLOSET_TAB_KEYS,
  PLAY_TAB_KEYS,
  shouldShowSurfaceToggle,
  surfaceForSegments,
  surfaceToggleCopy,
} from './surfaceRoute';

describe('surfaceForSegments', () => {
  it('reads the side from the route group', () => {
    expect(surfaceForSegments(['(tabs)', 'feed'])).toBe('play');
    expect(surfaceForSegments(['(closet)', 'accountant'])).toBe('closet');
    expect(surfaceForSegments(['(closet)', 'paywall'])).toBe('closet');
  });

  it('leaves screens of neither side unassigned', () => {
    expect(surfaceForSegments([])).toBeNull();
    expect(surfaceForSegments(['(auth)', 'login'])).toBeNull();
    expect(surfaceForSegments(['checkout'])).toBeNull();
    expect(surfaceForSegments(['reveal', '[orderId]'])).toBeNull();
  });
});

describe('shouldShowSurfaceToggle', () => {
  it('shows on every bottom-nav screen of both sides', () => {
    for (const key of PLAY_TAB_KEYS) expect(shouldShowSurfaceToggle(['(tabs)', key])).toBe(true);
    for (const key of CLOSET_TAB_KEYS) expect(shouldShowSurfaceToggle(['(closet)', key])).toBe(true);
  });

  it('hides on Closet sub-screens', () => {
    for (const key of ['onboarding', 'paywall', 'consent', 'privacy', 'swap', 'metrics']) {
      expect(shouldShowSurfaceToggle(['(closet)', key])).toBe(false);
    }
  });

  it('hides on sign-in, onboarding and modal screens', () => {
    const screens = [
      [],
      ['(auth)', 'login'],
      ['(onboarding)', 'avatar'],
      ['cart'],
      ['checkout'],
      ['reveal', '[orderId]'],
      ['coins', 'buy'],
      ['seller', 'list'],
      ['listing', '[id]'],
      ['order', '[id]'],
      ['(tabs)'],
    ];
    for (const segments of screens) expect(shouldShowSurfaceToggle(segments)).toBe(false);
  });

  it("doesn't show one side's tab name under the other side's group", () => {
    expect(shouldShowSurfaceToggle(['(tabs)', 'today'])).toBe(false);
    expect(shouldShowSurfaceToggle(['(closet)', 'feed'])).toBe(false);
  });
});

describe('surfaceToggleCopy', () => {
  it('names the destination, not the side on screen', () => {
    expect(surfaceToggleCopy('play')).toEqual({
      target: 'closet',
      label: 'Closet →',
      accessibilityLabel: 'Switch to Worn Closet',
    });
    expect(surfaceToggleCopy('closet')).toEqual({
      target: 'play',
      label: '← Play',
      accessibilityLabel: 'Switch to Worn Play',
    });
  });
});
