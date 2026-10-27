import { describe, expect, it } from 'vitest';

import {
  METRICS_SYNC_FEED_HREF,
  activityRowIsBodySafe,
  hrefAfterSyncSuccess,
  shouldOpenSyncFeed,
} from './syncFeedAfter';

describe('W074 sync feed after', () => {
  it('opens feed when focus=sync-feed', () => {
    expect(shouldOpenSyncFeed({ focus: 'sync-feed' })).toBe(true);
    expect(shouldOpenSyncFeed({ focus: ['sync-feed'] })).toBe(true);
    expect(shouldOpenSyncFeed({ focus: 'found-money' })).toBe(false);
    expect(shouldOpenSyncFeed({})).toBe(false);
    expect(shouldOpenSyncFeed(null)).toBe(false);
  });

  it('routes to metrics after ingested sync or reconnect', () => {
    expect(hrefAfterSyncSuccess({ ingestedCount: 3 })).toEqual(METRICS_SYNC_FEED_HREF);
    expect(hrefAfterSyncSuccess({ ingestedCount: 0, isReconnect: true })).toEqual(
      METRICS_SYNC_FEED_HREF,
    );
    expect(hrefAfterSyncSuccess({ ingestedCount: 0 })).toBeNull();
  });

  it('rejects rows that still carry raw body fields', () => {
    expect(
      activityRowIsBodySafe({
        subject: 'Your order',
        snippet: 'Shipped',
      }),
    ).toBe(true);
    expect(activityRowIsBodySafe({ subject: 'x', body: 'SECRET' })).toBe(false);
    expect(activityRowIsBodySafe({ rawBody: '…' })).toBe(false);
    expect(activityRowIsBodySafe({ raw: {} })).toBe(false);
  });
});
