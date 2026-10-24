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
    integrations: [
      // Request errors are reported by our onError hook (error-reporting.ts), with request tags.
      // Left on, this integration captures route errors first and Sentry then drops the hook's
      // report of the same error as already seen. Tracing is unaffected.
      Sentry.fastifyIntegration({ shouldHandleError: () => false }),
    ],
  });
  initialized = true;
}

export type CaptureOptions = {
  /** Set on this event only; searchable in Sentry. */
  tags?: Record<string, string>;
  /** Nothing in our code caught it (Fastify answered 500): flagged unhandled, as Sentry does. */
  unhandled?: boolean;
};

/** No-op until initSentry has run with a DSN. */
export function captureException(error: unknown, { tags, unhandled }: CaptureOptions = {}): void {
  if (!initialized) return;
  Sentry.captureException(error, {
    ...(tags && { captureContext: { tags } }),
    ...(unhandled && { mechanism: { type: "fastify", handled: false } }),
  });
}
