import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dehydrate,
  hydrate,
  type DehydratedState,
  type InfiniteData,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';
import Constants from 'expo-constants';

/**
 * A small AsyncStorage persister for the query cache (MOB 23), so the closet opens with what it
 * showed last time, offline too, while fresh data loads.
 *
 * - Only the closet itself and the day's plan are kept. Money, vault, receipts and consent data
 *   never go to this plain file.
 * - Wardrobe lists keep their first page only.
 * - The copy belongs to one user and one app version, and is dropped after a day.
 */
export const QUERY_CACHE_KEY = 'worn.query-cache.v1';
export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;
const WRITE_DELAY_MS = 1_000;

export const PERSISTED_QUERY_DOMAINS: ReadonlySet<string> = new Set([
  'wardrobe',
  'today-outfit',
  'week-outfits',
  'closet-profiles',
]);

type PersistedQueryCache = {
  buster: string;
  userId: string;
  savedAt: number;
  state: DehydratedState;
};

function cacheBuster() {
  return `app-${Constants.expoConfig?.version ?? 'dev'}`;
}

/** True for a loaded closet query that belongs to `userId` (keys are `[domain, userId, ...]`). */
export function shouldPersistQuery(query: Query, userId: string): boolean {
  const [domain, owner] = query.queryKey;
  return (
    query.state.status === 'success' &&
    typeof domain === 'string' &&
    PERSISTED_QUERY_DOMAINS.has(domain) &&
    owner === userId
  );
}

function isInfiniteData(data: unknown): data is InfiniteData<unknown, unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { pages?: unknown }).pages) &&
    Array.isArray((data as { pageParams?: unknown }).pageParams)
  );
}

function firstPageOnly(state: DehydratedState): DehydratedState {
  return {
    ...state,
    queries: state.queries.map((query) => {
      const data = query.state.data;
      if (!isInfiniteData(data) || data.pages.length <= 1) return query;
      return {
        ...query,
        state: {
          ...query.state,
          data: { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
        },
      };
    }),
  };
}

/** Writes the user's closet queries now. With no user, removes the stored copy. */
export async function persistQueries(queryClient: QueryClient, userId: string | null) {
  if (!userId) {
    await AsyncStorage.removeItem(QUERY_CACHE_KEY);
    return;
  }
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => shouldPersistQuery(query, userId),
    shouldDehydrateMutation: () => false,
  });
  const payload: PersistedQueryCache = {
    buster: cacheBuster(),
    userId,
    savedAt: Date.now(),
    state: firstPageOnly(state),
  };
  await AsyncStorage.setItem(QUERY_CACHE_KEY, JSON.stringify(payload));
}

/**
 * Puts the stored queries back for `userId`. A copy for another user, another app version, or
 * older than a day is removed instead. Never throws; true when something was restored.
 */
export async function restorePersistedQueries(
  queryClient: QueryClient,
  userId: string,
  now = Date.now(),
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(QUERY_CACHE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as Partial<PersistedQueryCache> | null;
    const usable =
      saved?.userId === userId &&
      saved.buster === cacheBuster() &&
      typeof saved.savedAt === 'number' &&
      now - saved.savedAt < QUERY_CACHE_MAX_AGE_MS &&
      Array.isArray(saved.state?.queries);
    if (!usable) {
      await AsyncStorage.removeItem(QUERY_CACHE_KEY);
      return false;
    }
    // Stored queries come back stale (their own updatedAt), so screens refetch them on mount.
    hydrate(queryClient, saved.state);
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[query-cache] not restored', error);
    await AsyncStorage.removeItem(QUERY_CACHE_KEY).catch(() => undefined);
    return false;
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Saves the closet queries a second after they change, for as long as the returned function
 * isn't called. `getUserId` is read at write time, so a sign-out removes the copy.
 */
export function startQueryPersistence(
  queryClient: QueryClient,
  getUserId: () => string | null,
): () => void {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const domain = event.query.queryKey[0];
    if (typeof domain !== 'string' || !PERSISTED_QUERY_DOMAINS.has(domain)) return;
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void persistQueries(queryClient, getUserId()).catch((error: unknown) => {
        if (__DEV__) console.warn('[query-cache] not saved', error);
      });
    }, WRITE_DELAY_MS);
  });
  return () => {
    unsubscribe();
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = null;
  };
}

/** Sign-out: drop any pending write and the stored copy. */
export async function clearPersistedQueries() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  await AsyncStorage.removeItem(QUERY_CACHE_KEY).catch(() => undefined);
}
