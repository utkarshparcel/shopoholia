import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/src/stores/session';

import { fetchCart, fetchCoinBalance, verifyOtp } from './client';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'https://api.worn.test' } } },
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const unauthorized = () => json({ error: 'Unauthorized', message: 'Token expired' }, 401);

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Endpoints accept only `validToken`; /auth/refresh is answered by `refresh`. */
function stubApi({ validToken, refresh }: { validToken: string; refresh: Handler }) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/auth/refresh')) return refresh(url, init);
    const auth = new Headers(init.headers).get('Authorization');
    if (auth !== `Bearer ${validToken}`) return unauthorized();
    if (url.endsWith('/cart')) return json({ items: [], coinTotal: 0 });
    if (url.endsWith('/coins/balance')) return json({ balance: 120 });
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const refreshCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));

beforeEach(() => {
  useSessionStore.getState().setSession({ accessToken: 'old', refreshToken: 'r1', phone: '919876543210' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionStore.getState().clear();
});

describe('expired access tokens', () => {
  it('renews the session once and retries the request', async () => {
    const fetchMock = stubApi({
      validToken: 'new',
      refresh: (_url, init) => {
        expect(JSON.parse(String(init.body))).toEqual({ refreshToken: 'r1' });
        return json({ accessToken: 'new', refreshToken: 'r2' });
      },
    });

    await expect(fetchCart('old')).resolves.toEqual({ items: [], coinTotal: 0 });

    expect(refreshCalls(fetchMock)).toHaveLength(1);
    expect(useSessionStore.getState()).toMatchObject({
      accessToken: 'new',
      refreshToken: 'r2',
      phone: '919876543210',
    });
  });

  it('shares one renewal between requests that expire together', async () => {
    const fetchMock = stubApi({
      validToken: 'new',
      refresh: () => json({ accessToken: 'new', refreshToken: 'r2' }),
    });

    const [cart, balance] = await Promise.all([fetchCart('old'), fetchCoinBalance('old')]);

    expect(cart).toEqual({ items: [], coinTotal: 0 });
    expect(balance).toEqual({ balance: 120 });
    expect(refreshCalls(fetchMock)).toHaveLength(1);
  });

  it('retries with a token another request already renewed', async () => {
    useSessionStore.getState().setTokens({ accessToken: 'new', refreshToken: 'r2' });
    const fetchMock = stubApi({ validToken: 'new', refresh: () => unauthorized() });

    await expect(fetchCart('old')).resolves.toEqual({ items: [], coinTotal: 0 });

    expect(refreshCalls(fetchMock)).toHaveLength(0);
  });

  it('signs out when the refresh token is rejected', async () => {
    stubApi({ validToken: 'new', refresh: () => unauthorized() });

    await expect(fetchCart('old')).rejects.toThrow('Token expired');

    expect(useSessionStore.getState()).toMatchObject({ accessToken: null, refreshToken: null });
  });

  it('keeps the session when the API is unreachable for the renewal', async () => {
    stubApi({
      validToken: 'new',
      refresh: () => {
        throw new TypeError('Network request failed');
      },
    });

    await expect(fetchCart('old')).rejects.toThrow('Token expired');

    expect(useSessionStore.getState()).toMatchObject({ accessToken: 'old', refreshToken: 'r1' });
  });

  it('keeps the session when the refresh endpoint has a server error', async () => {
    stubApi({ validToken: 'new', refresh: () => json({ error: 'Internal' }, 500) });

    await expect(fetchCart('old')).rejects.toThrow('Token expired');

    expect(useSessionStore.getState()).toMatchObject({ accessToken: 'old', refreshToken: 'r1' });
  });

  it("doesn't touch the session for requests sent without a token", async () => {
    const fetchMock = stubApi({ validToken: 'new', refresh: () => json({}) });

    await expect(verifyOtp('919876543210', '000000')).rejects.toThrow('Token expired');

    expect(refreshCalls(fetchMock)).toHaveLength(0);
    expect(useSessionStore.getState().accessToken).toBe('old');
  });
});
