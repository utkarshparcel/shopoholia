/**
 * Pure helpers for Closet screen loading / empty / error / offline phases.
 * Kept free of React Native so vitest can cover them without UI mocks.
 */

export type ClosetContentMode = 'skeleton' | 'error' | 'empty' | 'content';

export type ClosetContentModeInput = {
  /** Initial or blocking load (no paint-able data yet). */
  isLoading: boolean;
  isError: boolean;
  /** True when the primary list/object is absent after a successful fetch. */
  isEmpty: boolean;
  /**
   * True when we already have something to paint (stale-while-revalidate).
   * Skips skeleton/error full-screen so PTR can refresh in place.
   */
  hasContent?: boolean;
};

/**
 * Resolve which full-screen body ClosetScreen should render.
 * Priority: skeleton → error → empty → content.
 */
export function resolveClosetContentMode(input: ClosetContentModeInput): ClosetContentMode {
  const hasContent = Boolean(input.hasContent);
  if (input.isLoading && !hasContent) return 'skeleton';
  if (input.isError && !hasContent) return 'error';
  if (input.isEmpty && !hasContent) return 'empty';
  return 'content';
}

export type NetInfoLike = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

/** True when NetInfo reports no connection or unreachable internet. */
export function isNetInfoOffline(state: NetInfoLike): boolean {
  if (state.isConnected === false) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}

/**
 * Normalize ClosetScreen `error` prop into display copy.
 * Returns null when there is no error to show.
 */
export function closetErrorText(
  error: boolean | string | null | undefined,
  errorMessage?: string,
): string | null {
  if (error == null || error === false) return null;
  if (typeof error === 'string' && error.trim()) return error;
  return errorMessage ?? 'Something went wrong. Try again.';
}

/** Whether to show skeleton vs keep content during a pull-to-refresh. */
export function shouldShowSkeleton(isLoading: boolean, hasContent: boolean): boolean {
  return isLoading && !hasContent;
}
