import { describe, expect, it } from 'vitest';

import {
  demoExitedProps,
  skipPathAnalyticsProps,
  timeToFoundMoneyProps,
} from './firstDelight';

describe('firstDelight skip / demo analytics (W001 / W008)', () => {
  it('skipPathAnalyticsProps always includes seconds', () => {
    expect(skipPathAnalyticsProps(null)).toEqual({ seconds: 0 });
    expect(skipPathAnalyticsProps(1_000, 6_000)).toEqual({ seconds: 5 });
  });

  it('demoExitedProps tags demo source', () => {
    expect(demoExitedProps(2_000, 7_000)).toEqual({
      seconds: 5,
      source: 'demo',
    });
  });

  it('time_to_found_money props stay source-aware', () => {
    expect(timeToFoundMoneyProps(null, 'manual')).toBeNull();
    expect(timeToFoundMoneyProps(1_000, 'oauth', 4_000)).toEqual({
      seconds: 3,
      source: 'oauth',
    });
  });
});
