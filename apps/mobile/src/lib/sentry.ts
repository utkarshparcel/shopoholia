import * as Sentry from '@sentry/react-native';
import { sentrySmokeMessage, wornSentryTags } from '@worn/shared';

let initialized = false;
/** The surface on screen (Play unless the Closet is open); every event is tagged with it. */
let surface: 'play' | 'closet' = 'play';

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
    initialScope: {
      tags: wornSentryTags({ surface }),
    },
  });
  initialized = true;

  if (process.env.EXPO_PUBLIC_SENTRY_SMOKE === '1') {
    Sentry.captureMessage(sentrySmokeMessage(surface), 'info');
  }
}

/**
 * Tags later events with the surface the user is on. Play is the default (and the only surface
 * in release builds); the root layout calls this when the Closet surface opens or closes.
 */
export function setSentrySurface(next: 'play' | 'closet'): void {
  surface = next;
  if (initialized) Sentry.setTag('worn_surface', next);
}

export function captureException(
  error: unknown,
  tags?: Record<string, string>,
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (tags) scope.setTags(tags);
    Sentry.captureException(error);
  });
}

/** Closet screen / query errors — always tagged worn_surface=closet. */
export function captureClosetException(
  error: unknown,
  opts: { screen: string } & Record<string, string | undefined> = { screen: 'unknown' },
): void {
  const { screen, ...rest } = opts;
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v != null) extra[k] = v;
  }
  captureException(error, {
    ...wornSentryTags({ surface: 'closet', screen }),
    ...extra,
  });
}

/** Preview smoke — returns true when a message was queued. */
export function captureSmokeEvent(): boolean {
  if (!initialized) return false;
  Sentry.captureMessage(sentrySmokeMessage(surface), 'info');
  return true;
}

export function resetSentryForTests(): void {
  initialized = false;
  surface = 'play';
}
