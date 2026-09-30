import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchFeed, fetchFeedCategories } from './client';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'https://api.worn.test' } } },
}));

const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ items: [], nextCursor: null, categories: [] }), { status: 200 }),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feed client', () => {
  it('asks for one category and sends the access token when signed in', async () => {
    await fetchFeed('1:4:abc', 20, undefined, {
      category: 'sweaters and sweatshirts',
      accessToken: 'token-123',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    const { pathname, searchParams } = new URL(url);
    expect(pathname).toBe('/feed');
    expect(searchParams.get('category')).toBe('sweaters and sweatshirts');
    expect(searchParams.get('cursor')).toBe('1:4:abc');
    expect(searchParams.get('limit')).toBe('20');
    expect(init?.headers).toEqual({ Authorization: 'Bearer token-123' });
  });

  it('sends neither a category nor a token for a signed-out "All" feed', async () => {
    await fetchFeed(undefined, 10);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.worn.test/feed?limit=10');
    expect(init?.headers).toEqual({});
  });

  it('loads categories from the feed categories endpoint', async () => {
    await expect(fetchFeedCategories()).resolves.toMatchObject({ categories: [] });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.worn.test/feed/categories');
  });
});
