import { describe, expect, it } from 'vitest';

import {
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
