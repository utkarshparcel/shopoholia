import type { AnalyticsEventName, AnalyticsProperties } from '@worn/shared';

import { startPostHog } from '@/src/lib/posthog';

export type AnalyticsSink = (
  name: AnalyticsEventName,
  properties?: AnalyticsProperties,
) => void;

const consoleSink: AnalyticsSink = (name, properties) => {
  if (process.env.NODE_ENV === 'test') return;
  console.info('[analytics]', name, properties ?? {});
};

let sink: AnalyticsSink | null = null;
let stopSink: (() => void) | null = null;

/** PostHog when EXPO_PUBLIC_POSTHOG_KEY is set; otherwise the console in dev, nothing in release. */
function createDefaultSink(): AnalyticsSink {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return __DEV__ ? consoleSink : () => undefined;

  const posthog = startPostHog(apiKey, process.env.EXPO_PUBLIC_POSTHOG_HOST);
  stopSink = posthog.stop;
  return posthog.capture;
}

export function setAnalyticsSink(next: AnalyticsSink) {
  resetAnalyticsSink();
  sink = next;
}

/** Back to the default sink, created from env on the next event. */
export function resetAnalyticsSink() {
  stopSink?.();
  stopSink = null;
  sink = null;
}

/** Never throws: a tracking failure must not break the screen doing the tracking. */
export function trackEvent(name: AnalyticsEventName, properties?: AnalyticsProperties) {
  try {
    if (!sink) sink = createDefaultSink();
    sink(name, properties);
  } catch (error) {
    if (__DEV__) console.warn('[analytics] could not track', name, error);
  }
}
