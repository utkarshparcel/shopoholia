/**
 * W097 — Offline banner copy: retry CTA + queued action count.
 */

export type OfflineBannerCopy = {
  message: string;
  queuedLine: string | null;
  retryLabel: string;
  a11yLabel: string;
};

export function offlineBannerCopy(queuedCount = 0): OfflineBannerCopy {
  const safe = Math.max(0, Math.floor(queuedCount));
  const queuedLine =
    safe <= 0
      ? null
      : safe === 1
        ? '1 action queued'
        : `${safe} actions queued`;
  const message = 'You’re offline — showing what we have.';
  const retryLabel = 'Retry';
  const a11yLabel = queuedLine ? `${message} ${queuedLine}. ${retryLabel}` : `${message} ${retryLabel}`;
  return { message, queuedLine, retryLabel, a11yLabel };
}
