/**
 * W074 — after a successful sync, open the “What we read” feed (no raw body).
 */

export const METRICS_SYNC_FEED_HREF = {
  pathname: '/(closet)/metrics' as const,
  params: { focus: 'sync-feed' as const },
};

export const SYNC_FEED_FOCUS = 'sync-feed' as const;

export type SyncFeedFocusParams = {
  focus?: string | string[];
};

/** True when navigation asked metrics to surface the transparency feed. */
export function shouldOpenSyncFeed(params: SyncFeedFocusParams | null | undefined): boolean {
  if (!params?.focus) return false;
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  return focus === SYNC_FEED_FOCUS;
}

/**
 * Activity rows must never expose raw email/SMS bodies — only merchant, subject,
 * snippet, totals, and status already shaped by the API.
 */
export function activityRowIsBodySafe(item: {
  subject?: string | null;
  snippet?: string | null;
  body?: unknown;
  rawBody?: unknown;
  raw?: unknown;
}): boolean {
  if (item.body != null || item.rawBody != null || item.raw != null) return false;
  return true;
}

/** Prefer metrics sync-feed after a sync that actually ingested something. */
export function hrefAfterSyncSuccess(opts: {
  ingestedCount: number;
  isReconnect?: boolean;
}): typeof METRICS_SYNC_FEED_HREF | null {
  if (opts.ingestedCount > 0 || opts.isReconnect) return METRICS_SYNC_FEED_HREF;
  return null;
}
