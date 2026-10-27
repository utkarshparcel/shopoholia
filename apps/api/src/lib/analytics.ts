import {
  createHttpAnalyticsSink,
  sanitizeAnalyticsProperties,
  type AnalyticsEventName,
  type AnalyticsProperties,
  type AnalyticsSink,
} from "@worn/shared";

export type ServerAnalyticsSink = AnalyticsSink;

const defaultSink: ServerAnalyticsSink = (name, properties) => {
  // Mirrors the mobile client: no-op in test so it never pollutes test output.
  // In dev/prod this would forward to PostHog / Mixpanel / a queue; for now we
  // log. Swapping in a real sink is a one-liner via `setServerAnalyticsSink`.
  if (process.env.NODE_ENV === "test") return;
  console.info("[analytics]", name, properties ?? {});
};

let sink: ServerAnalyticsSink = defaultSink;

export function setServerAnalyticsSink(next: ServerAnalyticsSink): void {
  sink = next;
}

export function resetServerAnalyticsSink(): void {
  sink = defaultSink;
}

/**
 * Prefer ANALYTICS_WEBHOOK_URL, else POSTHOG_KEY. Returns true when an HTTP
 * sink was installed.
 */
export function initServerAnalyticsFromEnv(): boolean {
  const next = createHttpAnalyticsSink({
    webhookUrl: process.env.ANALYTICS_WEBHOOK_URL,
    posthogKey: process.env.POSTHOG_KEY,
    posthogHost: process.env.POSTHOG_HOST,
  });
  if (!next) return false;
  setServerAnalyticsSink(next);
  return true;
}

/** Fire a server-side analytics event. Never throws — analytics must not be
 * able to break a request. */
export function trackServerEvent(
  name: AnalyticsEventName,
  properties?: AnalyticsProperties,
): void {
  try {
    sink(name, sanitizeAnalyticsProperties(properties));
  } catch {
    // swallow — analytics is best-effort
  }
}
