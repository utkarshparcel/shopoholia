import { describe, expect, it } from 'vitest';

import {
  closetAlertText,
  closetErrorText,
  isNetInfoOffline,
  resolveClosetContentMode,
  shouldShowSkeleton,
} from './closetScreenState';

describe('resolveClosetContentMode', () => {
  it('prefers skeleton on initial load without content', () => {
    expect(
      resolveClosetContentMode({
        isLoading: true,
        isError: false,
        isEmpty: true,
      }),
    ).toBe('skeleton');
  });

  it('keeps content while refreshing when hasContent', () => {
    expect(
      resolveClosetContentMode({
        isLoading: true,
        isError: false,
        isEmpty: false,
        hasContent: true,
      }),
    ).toBe('content');
  });

  it('shows error when fetch failed and nothing to paint', () => {
    expect(
      resolveClosetContentMode({
        isLoading: false,
        isError: true,
        isEmpty: true,
      }),
    ).toBe('error');
  });

  it('does not blank content on error when hasContent', () => {
    expect(
      resolveClosetContentMode({
        isLoading: false,
        isError: true,
        isEmpty: false,
        hasContent: true,
      }),
    ).toBe('content');
  });

  it('shows empty after successful empty fetch', () => {
    expect(
      resolveClosetContentMode({
        isLoading: false,
        isError: false,
        isEmpty: true,
      }),
    ).toBe('empty');
  });

  it('keeps content when empty flag set but hasContent', () => {
    expect(
      resolveClosetContentMode({
        isLoading: false,
        isError: false,
        isEmpty: true,
        hasContent: true,
      }),
    ).toBe('content');
  });

  it('shows content when data present', () => {
    expect(
      resolveClosetContentMode({
        isLoading: false,
        isError: false,
        isEmpty: false,
        hasContent: true,
      }),
    ).toBe('content');
  });
});

describe('isNetInfoOffline', () => {
  it('is offline when disconnected', () => {
    expect(isNetInfoOffline({ isConnected: false })).toBe(true);
  });

  it('is offline when internet unreachable', () => {
    expect(isNetInfoOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('is online when connected and reachable', () => {
    expect(isNetInfoOffline({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('treats null connected as not offline yet', () => {
    expect(isNetInfoOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
  });
});

describe('closetErrorText', () => {
  it('returns null when no error', () => {
    expect(closetErrorText(null)).toBeNull();
    expect(closetErrorText(false)).toBeNull();
    expect(closetErrorText(undefined)).toBeNull();
  });

  it('returns string errors as-is', () => {
    expect(closetErrorText('Network failed')).toBe('Network failed');
  });

  it('uses fallback for boolean true', () => {
    expect(closetErrorText(true)).toBe('Something went wrong. Try again.');
    expect(closetErrorText(true, 'Custom')).toBe('Custom');
  });
});

describe('shouldShowSkeleton', () => {
  it('shows skeleton only when loading without content', () => {
    expect(shouldShowSkeleton(true, false)).toBe(true);
    expect(shouldShowSkeleton(true, true)).toBe(false);
    expect(shouldShowSkeleton(false, false)).toBe(false);
  });
});

describe('closetAlertText (MOB 18)', () => {
  class FakeApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }

  it('passes the API message through when it is written for people', () => {
    expect(closetAlertText(new FakeApiError(409, 'That card is already in your Vault.'))).toBe(
      'That card is already in your Vault.',
    );
    expect(closetAlertText(new Error('Sign in to add a card.'))).toBe('Sign in to add a card.');
  });

  it('never shows a schema dump, a gateway page or a parse error', () => {
    expect(closetAlertText(new FakeApiError(400, 'body/relationship Invalid enum value'))).toBe(
      'Some details were not accepted. Check them and try again.',
    );
    expect(closetAlertText(new FakeApiError(502, '<html>Bad gateway</html>'))).toBe(
      'The server had a problem. Try again in a moment.',
    );
    expect(closetAlertText(new SyntaxError("JSON Parse error: Unexpected character '<'"))).toBe(
      'The server sent a response the app could not read.',
    );
  });

  it('names network failures, rate limits and ended sessions plainly', () => {
    expect(closetAlertText(new TypeError('Network request failed'))).toMatch(/Check your connection/);
    expect(closetAlertText(new FakeApiError(429, 'Too Many Requests'))).toMatch(/Too many tries/);
    expect(closetAlertText(new FakeApiError(401, 'Unauthorized'))).toMatch(/Sign in again/);
  });

  it('falls back when there is nothing to show', () => {
    expect(closetAlertText(undefined)).toBe('Something went wrong. Try again.');
    expect(closetAlertText(new Error(''), 'Could not save')).toBe('Could not save');
  });
});
