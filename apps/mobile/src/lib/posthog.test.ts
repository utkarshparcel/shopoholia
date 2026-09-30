import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appState = vi.hoisted(() => ({
  listener: null as ((state: string) => void) | null,
  remove: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (_type: string, listener: (state: string) => void) => {
      appState.listener = listener;
      return { remove: appState.remove };
    },
  },
}));

import { useSessionStore } from '@/src/stores/session';

import { userIdFromAccessToken } from './access-token';
import { createPostHogClient, randomId, startPostHog } from './posthog';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type SentEvent = {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
  uuid: string;
};

type FetchInit = { method: string; headers: Record<string, string>; body: string };

const createFetchMock = () =>
  vi.fn(async (_url: string, _init: FetchInit) => ({ ok: true, status: 200 }));

let fetchMock: ReturnType<typeof createFetchMock>;

function sentBatches() {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(init.body) as { api_key: string; sent_at: string; batch: SentEvent[] },
  );
}

function sentEventNames() {
  return sentBatches().map(({ batch }) => batch.map((e) => e.event));
}

/** An unsigned JWT with the given claims, shaped like the API's access tokens. */
function accessToken(claims: object) {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = createFetchMock();
  vi.stubGlobal('fetch', fetchMock);
  appState.remove.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSessionStore.getState().clear();
});

describe('createPostHogClient', () => {
  it('sends queued events to /batch/ in one request after 10 seconds', async () => {
    const client = createPostHogClient({ apiKey: 'phc_test', properties: { $lib: 'worn-mobile' } });
    client.capture('add_to_cart', { listingId: 'listing-1', coins: 48 });
    client.capture('checkout', { tier: 'EXPRESS' });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://us.i.posthog.com/batch/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    const [{ api_key, sent_at, batch }] = sentBatches();
    expect(api_key).toBe('phc_test');
    expect(sent_at).toEqual(expect.any(String));
    expect(batch).toEqual([
      {
        event: 'add_to_cart',
        distinct_id: expect.stringMatching(UUID),
        properties: { $lib: 'worn-mobile', listingId: 'listing-1', coins: 48 },
        timestamp: expect.any(String),
        uuid: expect.stringMatching(UUID),
      },
      {
        event: 'checkout',
        distinct_id: batch[0]!.distinct_id,
        properties: { $lib: 'worn-mobile', tier: 'EXPRESS' },
        timestamp: expect.any(String),
        uuid: expect.stringMatching(UUID),
      },
    ]);
  });

  it('flushes as soon as 20 events are waiting', async () => {
    const client = createPostHogClient({ apiKey: 'phc_test' });
    for (let i = 0; i < 19; i++) client.capture('share');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    client.capture('share');
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sentBatches()[0]!.batch).toHaveLength(20);
  });

  it('sends to a custom host', async () => {
    const client = createPostHogClient({ apiKey: 'phc_test', host: 'https://eu.i.posthog.com/' });
    client.capture('install');
    await client.flush();

    expect(fetchMock.mock.calls[0]![0]).toBe('https://eu.i.posthog.com/batch/');
  });

  it('identifies the user on sign-in, and uses a new anonymous id after sign-out', async () => {
    const client = createPostHogClient({ apiKey: 'phc_test' });
    client.capture('install');
    client.identify('user-1');
    client.identify('user-1');
    client.capture('checkout');
    client.identify(null);
    client.capture('share');
    await client.flush();

    const { batch } = sentBatches()[0]!;
    expect(batch.map((e) => e.event)).toEqual(['install', '$identify', 'checkout', 'share']);
    const [install, identify, checkout, share] = batch;
    expect(identify).toMatchObject({
      distinct_id: 'user-1',
      properties: { $anon_distinct_id: install!.distinct_id },
    });
    expect(checkout!.distinct_id).toBe('user-1');
    expect(share!.distinct_id).not.toBe('user-1');
    expect(share!.distinct_id).not.toBe(install!.distinct_id);
  });

  it('keeps events that could not be sent and retries them on its own', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    const client = createPostHogClient({ apiKey: 'phc_test' });

    client.capture('checkout');
    await client.flush();
    client.capture('share');
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sentEventNames()).toEqual([['checkout'], ['checkout', 'share'], ['checkout', 'share']]);
    // Same uuid on every attempt, so PostHog can drop a duplicate.
    expect(sentBatches()[2]!.batch[0]!.uuid).toBe(sentBatches()[0]!.batch[0]!.uuid);
  });

  it('waits for the timer instead of retrying on every event while offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const client = createPostHogClient({ apiKey: 'phc_test' });

    for (let i = 0; i < 20; i++) client.capture('share');
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 20; i++) client.capture('share');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBatches()[1]!.batch).toHaveLength(40);
  });

  it('drops a batch PostHog rejects outright', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    const client = createPostHogClient({ apiKey: 'phc_wrong' });

    client.capture('checkout');
    await client.flush();
    client.capture('share');
    await client.flush();

    expect(sentEventNames()).toEqual([['checkout'], ['share']]);
    expect(warn).toHaveBeenCalledWith('[analytics] PostHog rejected 1 event(s) (HTTP 401)');
  });

  it('never throws, even when fetch does', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('fetch is broken');
    });
    const client = createPostHogClient({ apiKey: 'phc_test' });

    expect(() => client.capture('checkout')).not.toThrow();
    await expect(client.flush()).resolves.toBeUndefined();
  });
});

describe('userIdFromAccessToken', () => {
  it("reads the token's sub claim", () => {
    expect(userIdFromAccessToken(accessToken({ sub: 'user-42', phone: '919876543210' }))).toBe(
      'user-42',
    );
  });

  it.each([null, '', 'not-a-jwt', 'a.%%%.c', accessToken({ phone: '919876543210' })])(
    'returns null for %j',
    (token) => {
      expect(userIdFromAccessToken(token)).toBeNull();
    },
  );
});

describe('randomId', () => {
  it('makes a v4 UUID without crypto.randomUUID, as on Hermes', () => {
    vi.stubGlobal('crypto', undefined);
    expect(randomId()).toMatch(UUID);
    expect(randomId()).not.toBe(randomId());
  });
});

describe('startPostHog', () => {
  it('identifies the signed-in user and flushes when the app leaves the foreground', async () => {
    const posthog = startPostHog('phc_test');
    posthog.capture('install');
    useSessionStore
      .getState()
      .setSession({ accessToken: accessToken({ sub: 'user-42' }), refreshToken: 'refresh' });
    useSessionStore.getState().setCoinBalance(500);
    posthog.capture('checkout');

    appState.listener?.('background');
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    const { batch } = sentBatches()[0]!;
    expect(batch.map((e) => [e.event, e.distinct_id])).toEqual([
      ['install', batch[0]!.distinct_id],
      ['$identify', 'user-42'],
      ['checkout', 'user-42'],
    ]);
    expect(batch[1]!.properties).toEqual({
      $lib: 'worn-mobile',
      $os: 'iOS',
      $anon_distinct_id: batch[0]!.distinct_id,
    });
    posthog.stop();
  });

  it('uses the id of a user who is already signed in', async () => {
    useSessionStore
      .getState()
      .setSession({ accessToken: accessToken({ sub: 'user-7' }), refreshToken: 'refresh' });
    const posthog = startPostHog('phc_test', 'https://eu.i.posthog.com');
    posthog.capture('checkout');

    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock.mock.calls[0]![0]).toBe('https://eu.i.posthog.com/batch/');
    expect(sentBatches()[0]!.batch.map((e) => [e.event, e.distinct_id])).toEqual([
      ['$identify', 'user-7'],
      ['checkout', 'user-7'],
    ]);
    posthog.stop();
  });

  it('stops listening once stopped', async () => {
    const posthog = startPostHog('phc_test');
    posthog.stop();
    useSessionStore
      .getState()
      .setSession({ accessToken: accessToken({ sub: 'user-42' }), refreshToken: 'refresh' });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(appState.remove).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
