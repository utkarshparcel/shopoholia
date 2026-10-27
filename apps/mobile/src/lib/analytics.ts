import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createHttpAnalyticsSink,
  sanitizeAnalyticsProperties,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from '@worn/shared';

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

/**
 * EXPO_PUBLIC_ANALYTICS_WEBHOOK_URL when set, else PostHog when EXPO_PUBLIC_POSTHOG_KEY is set;
 * otherwise the console in dev, nothing in release.
 */
function createDefaultSink(): AnalyticsSink {
  const webhook = createHttpAnalyticsSink({
    webhookUrl: process.env.EXPO_PUBLIC_ANALYTICS_WEBHOOK_URL,
  });
  if (webhook) return webhook;

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

/** Creates the env sink now rather than on the first event; false when no sink is configured. */
export function initAnalyticsFromEnv(): boolean {
  if (
    !process.env.EXPO_PUBLIC_ANALYTICS_WEBHOOK_URL?.trim() &&
    !process.env.EXPO_PUBLIC_POSTHOG_KEY
  ) {
    return false;
  }
  if (!sink) sink = createDefaultSink();
  return true;
}

/** Set once the install event has been sent from this device. */
export const INSTALL_TRACKED_KEY = 'worn.analytics.install-tracked';

let installOnce: Promise<boolean> | null = null;

/**
 * Sends `install` the first time the app runs on a device, not on every cold start (MOB 33).
 * Resolves true when this call sent it. If storage can't be read, nothing is sent: a missed
 * install is better than one counted again on every launch.
 */
export function trackInstallOnce(): Promise<boolean> {
  installOnce ??= (async () => {
    try {
      if (await AsyncStorage.getItem(INSTALL_TRACKED_KEY)) return false;
      await AsyncStorage.setItem(INSTALL_TRACKED_KEY, new Date().toISOString());
    } catch (error) {
      if (__DEV__) console.warn('[analytics] install flag unavailable', error);
      return false;
    }
    trackEvent('install');
    return true;
  })();
  return installOnce;
}

/** Test hook: let the next trackInstallOnce read storage again. */
export function resetInstallTrackingForTests() {
  installOnce = null;
}

/** Never throws: a tracking failure must not break the screen doing the tracking. */
export function trackEvent(name: AnalyticsEventName, properties?: AnalyticsProperties) {
  try {
    if (!sink) sink = createDefaultSink();
    // PII keys are dropped and emails / phones / card-length digits redacted before any sink.
    sink(name, properties && sanitizeAnalyticsProperties(properties));
  } catch (error) {
    if (__DEV__) console.warn('[analytics] could not track', name, error);
  }
}
