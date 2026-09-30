import * as Sentry from "@sentry/node";

let initialized = false;

/** Env-gated Sentry init — no-op without SENTRY_DSN. */
export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    enabled: true,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV ?? "development",
  });
  initialized = true;
}

/** `tags` go on this event only (searchable in Sentry); no-op until initSentry has run with a DSN. */
export function captureException(error: unknown, tags?: Record<string, string>): void {
  if (!initialized) return;
  Sentry.captureException(error, tags ? { tags } : undefined);
}
