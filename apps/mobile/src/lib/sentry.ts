import * as Sentry from '@sentry/react-native';

let initialized = false;

/** Env-gated Sentry init — no-op without EXPO_PUBLIC_SENTRY_DSN. */
export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    enabled: true,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
  initialized = true;
}

export function captureException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}
