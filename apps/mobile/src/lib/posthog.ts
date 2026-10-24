import type { AnalyticsEventName, AnalyticsProperties } from '@worn/shared';
import { AppState, Platform } from 'react-native';

import { useSessionStore } from '@/src/stores/session';
import { userIdFromAccessToken } from './access-token';

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

// Queued events go out every 10s, as soon as 20 are waiting, or when the app leaves the foreground.
const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_AT = 20;
// Past this the oldest events are dropped, so a long time offline can't grow memory unbounded.
const MAX_QUEUED = 1_000;

type QueuedEvent = {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
  uuid: string;
};

export type PostHogClient = {
  capture(event: AnalyticsEventName, properties?: AnalyticsProperties): void;
  /** The signed-in user's id, or null once they sign out. */
  identify(userId: string | null): void;
  flush(): Promise<void>;
  /** Cancels the pending flush timer. */
  shutdown(): void;
};

export function randomId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  // UUID v4 layout (Hermes has no crypto.randomUUID); Math.random is fine for analytics ids.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const nibble = Math.floor(Math.random() * 16);
    return (char === 'x' ? nibble : (nibble & 0x3) | 0x8).toString(16);
  });
}

/** Sends events to PostHog's /batch/ endpoint with plain fetch. Never throws. */
export function createPostHogClient({
  apiKey,
  host,
  properties: sharedProperties = {},
}: {
  apiKey: string;
  host?: string;
  /** Added to every event. */
  properties?: Record<string, string>;
}): PostHogClient {
  const endpoint = `${(host || DEFAULT_POSTHOG_HOST).replace(/\/+$/, '')}/batch/`;
  let anonymousId = randomId();
  let userId: string | null = null;
  let queue: QueuedEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retrying = false;
  let sending = Promise.resolve();

  const flushLater = () => {
    if (!timer) timer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
  };

  const enqueue = (event: string, properties: Record<string, unknown>) => {
    queue.push({
      event,
      distinct_id: userId ?? anonymousId,
      properties: { ...sharedProperties, ...properties },
      timestamp: new Date().toISOString(),
      uuid: randomId(),
    });
    if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED);
    // While a failed batch waits for its retry, new events wait for the timer too.
    if (queue.length >= FLUSH_AT && !retrying) void flush();
    else flushLater();
  };

  const send = async () => {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, batch, sent_at: new Date().toISOString() }),
      });
      if (res.ok || (res.status < 500 && res.status !== 429)) {
        // Any other 4xx means PostHog will never take this batch (e.g. a bad key): drop it.
        if (!res.ok && __DEV__) {
          console.warn(`[analytics] PostHog rejected ${batch.length} event(s) (HTTP ${res.status})`);
        }
        retrying = false;
        return;
      }
    } catch {
      // Offline or similar: retried below.
    }
    // uuid lets PostHog drop duplicates if a failed request did get through.
    queue = [...batch, ...queue].slice(-MAX_QUEUED);
    retrying = true;
    flushLater();
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    sending = sending.then(send);
    return sending;
  };

  return {
    capture: (event, properties) => enqueue(event, properties ?? {}),
    identify: (nextUserId) => {
      if (nextUserId === userId) return;
      const previousUserId = userId;
      userId = nextUserId;
      if (nextUserId === null) {
        // Signed out: later events get a fresh anonymous id, not the last user's.
        anonymousId = randomId();
        return;
      }
      // Links this session's anonymous events (e.g. install) to the user.
      enqueue('$identify', previousUserId === null ? { $anon_distinct_id: anonymousId } : {});
    },
    flush,
    shutdown: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

const OS_NAMES: Record<string, string> = { ios: 'iOS', android: 'Android' };

/**
 * PostHog for the app: events carry the signed-in user's id (anonymous before sign-in, with
 * an $identify linking the two) and are flushed whenever the app leaves the foreground.
 */
export function startPostHog(apiKey: string, host?: string) {
  const client = createPostHogClient({
    apiKey,
    host,
    properties: { $lib: 'worn-mobile', $os: OS_NAMES[Platform.OS] ?? Platform.OS },
  });

  const identify = (accessToken: string | null) => {
    try {
      client.identify(userIdFromAccessToken(accessToken));
    } catch {
      // Runs inside the session store's update; analytics must never break sign-in.
    }
  };
  identify(useSessionStore.getState().accessToken);
  const unsubscribe = useSessionStore.subscribe((state, previous) => {
    if (state.accessToken !== previous.accessToken) identify(state.accessToken);
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active') void client.flush();
  });

  return {
    capture: client.capture,
    stop: () => {
      unsubscribe();
      appState.remove();
      client.shutdown();
    },
  };
}
