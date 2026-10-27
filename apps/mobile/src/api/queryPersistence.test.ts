import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  QUERY_CACHE_KEY,
  QUERY_CACHE_MAX_AGE_MS,
  clearPersistedQueries,
  persistQueries,
  restorePersistedQueries,
  startQueryPersistence,
} from './queryPersistence';

const USER = 'user-1';

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function stored() {
  const raw = await AsyncStorage.getItem(QUERY_CACHE_KEY);
  return raw
    ? (JSON.parse(raw) as {
        userId: string;
        state: { queries: { queryKey: unknown[]; state: { data: unknown } }[] };
      })
    : null;
}

describe('query cache persistence (MOB 23)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the closet domains of the signed-in user', async () => {
    const qc = client();
    qc.setQueryData(['today-outfit', USER], { outfit: 'a' });
    qc.setQueryData(['closet-profiles', USER], { profiles: [] });
    qc.setQueryData(['gift-cards', USER], { cards: [{ balanceMinor: 100 }] });
    qc.setQueryData(['today-outfit', 'someone-else'], { outfit: 'b' });

    await persistQueries(qc, USER);

    const keys = (await stored())?.state.queries.map((q) => q.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ['today-outfit', USER],
        ['closet-profiles', USER],
      ]),
    );
    expect(keys).toHaveLength(2);
  });

  it('keeps the first wardrobe page only', async () => {
    const qc = client();
    qc.setQueryData(['wardrobe', USER, null, 30], {
      pages: [{ items: [1], nextCursor: 'c1' }, { items: [2], nextCursor: null }],
      pageParams: [null, 'c1'],
    });

    await persistQueries(qc, USER);

    expect((await stored())?.state.queries[0]?.state.data).toEqual({
      pages: [{ items: [1], nextCursor: 'c1' }],
      pageParams: [null],
    });
  });

  it('restores for the same user and drops a copy for another one', async () => {
    const first = client();
    first.setQueryData(['week-outfits', USER], { days: 7 });
    await persistQueries(first, USER);

    const other = client();
    expect(await restorePersistedQueries(other, 'user-2')).toBe(false);
    expect(other.getQueryData(['week-outfits', USER])).toBeUndefined();
    expect(await AsyncStorage.getItem(QUERY_CACHE_KEY)).toBeNull();

    await persistQueries(first, USER);
    const same = client();
    expect(await restorePersistedQueries(same, USER)).toBe(true);
    expect(same.getQueryData(['week-outfits', USER])).toEqual({ days: 7 });
  });

  it('drops a copy older than a day, and a corrupt one', async () => {
    const qc = client();
    qc.setQueryData(['today-outfit', USER], { outfit: 'a' });
    await persistQueries(qc, USER);

    const later = Date.now() + QUERY_CACHE_MAX_AGE_MS + 1;
    expect(await restorePersistedQueries(client(), USER, later)).toBe(false);
    expect(await AsyncStorage.getItem(QUERY_CACHE_KEY)).toBeNull();

    await AsyncStorage.setItem(QUERY_CACHE_KEY, '{not json');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await restorePersistedQueries(client(), USER)).toBe(false);
    expect(await AsyncStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
  });

  it('writes a second after a closet query loads, and nothing after sign-out', async () => {
    vi.useFakeTimers();
    const qc = client();
    let userId: string | null = USER;
    const stop = startQueryPersistence(qc, () => userId);

    await qc.fetchQuery({ queryKey: ['today-outfit', USER], queryFn: async () => ({ o: 1 }) });
    expect(await AsyncStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await stored())?.userId).toBe(USER);

    userId = null;
    await qc.fetchQuery({ queryKey: ['today-outfit', USER, 'x'], queryFn: async () => ({ o: 2 }) });
    await clearPersistedQueries();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await AsyncStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
    stop();
  });
});
