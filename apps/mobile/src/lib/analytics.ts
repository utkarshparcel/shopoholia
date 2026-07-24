import type { AnalyticsEventName, AnalyticsProperties } from '@worn/shared';

export type AnalyticsSink = (
  name: AnalyticsEventName,
  properties?: AnalyticsProperties,
) => void;

let sink: AnalyticsSink = (name, properties) => {
  if (process.env.NODE_ENV === 'test') return;
  console.info('[analytics]', name, properties ?? {});
};

/** Swap for PostHog/Mixpanel in production builds. */
export function setAnalyticsSink(next: AnalyticsSink) {
  sink = next;
}

export function resetAnalyticsSink() {
  sink = (name, properties) => {
    if (process.env.NODE_ENV === 'test') return;
    console.info('[analytics]', name, properties ?? {});
  };
}

export function trackEvent(name: AnalyticsEventName, properties?: AnalyticsProperties) {
  sink(name, properties);
}
