/**
 * Pure helpers for Closet screen loading / empty / error / offline phases.
 * Kept free of React Native so vitest can cover them without UI mocks.
 */

import { getConsentPlainCard } from './consentCenter';

export type ClosetContentMode = 'skeleton' | 'error' | 'empty' | 'content';

/** Subtitle for a Closet screen opened while the Closet feature is off in this build. */
export const CLOSET_OFF_SUBTITLE = 'Closet is not available in this version of WORN yet.';

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

/** Fastify's schema check: "body/relationship Invalid enum value…", never meant for people. */
const SCHEMA_ERROR_RE = /^(body|querystring|params|headers)[/.\s]/;
const NETWORK_ERROR_RE = /network request failed|failed to fetch|load failed|networkerror|timed? ?out|aborted/i;
/** The API's consent gate (`requireConsent`): 403 "Missing active consent for scope: FINANCIAL". */
const MISSING_CONSENT_RE = /^Missing active consent for scope: (\w+)$/;

/** The consent scope a 403 says is missing, so the screen can send the user to allow it. */
export function missingConsentScope(error: unknown): string | null {
  if ((error as { status?: unknown } | null)?.status !== 403) return null;
  const message = error instanceof Error ? error.message.trim() : '';
  return MISSING_CONSENT_RE.exec(message)?.[1] ?? null;
}

/**
 * Alert text for a caught error (MOB 18), through the same fallback as {@link closetErrorText}.
 * The API's own messages are written for people and pass through; schema dumps, gateway pages,
 * parse errors and network failures become plain sentences.
 */
export function closetAlertText(error: unknown, fallback?: string): string {
  const message = error instanceof Error ? error.message.trim() : '';
  const status = typeof (error as { status?: unknown } | null)?.status === 'number'
    ? (error as { status: number }).status
    : null;
  if (status !== null) {
    if (status >= 500) return 'The server had a problem. Try again in a moment.';
    if (status === 429) return 'Too many tries. Wait a moment and try again.';
    if (status === 401) return 'Your session ended. Sign in again.';
    const scope = missingConsentScope(error);
    if (scope) {
      const title = getConsentPlainCard(scope)?.title ?? scope.toLowerCase();
      return `Allow "${title}" in Privacy & consent first, then try again.`;
    }
    if (status === 400 && SCHEMA_ERROR_RE.test(message)) {
      return 'Some details were not accepted. Check them and try again.';
    }
  }
  if (error instanceof SyntaxError) return 'The server sent a response the app could not read.';
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' || NETWORK_ERROR_RE.test(message))) {
    return 'Could not reach WORN. Check your connection and try again.';
  }
  return closetErrorText(message || true, fallback) as string;
}

/** Whether to show skeleton vs keep content during a pull-to-refresh. */
export function shouldShowSkeleton(isLoading: boolean, hasContent: boolean): boolean {
  return isLoading && !hasContent;
}
