import type { QueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { ApiRequestError } from '@/src/api/client';
import { PERSISTED_QUERY_DOMAINS, QUERY_CACHE_MAX_AGE_MS } from '@/src/api/queryPersistence';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { useSessionStore } from '@/src/stores/session';

/**
 * Closet query keys are `[domain, userId, ...params]`.
 *
 * - Keyed by the user, not the access token: the token rotates every 15 minutes, and a key
 *   that holds it resets every cache entry when it does.
 * - Invalidate with `[domain]` to reach every variant of a domain (every profile, filter, id).
 */
export function closetKey(domain: string, userId: string | null, ...params: unknown[]) {
  return [domain, userId, ...params] as const;
}

/** The signed-in user's id. It stays the same when the access token is renewed. */
export function useSessionUserId(): string | null {
  return useSessionStore((s) => userIdFromAccessToken(s.accessToken));
}

/**
 * The current access token, read when the request starts so a renewed token is used.
 * Throws a 401 (which the query client doesn't retry) when signed out.
 */
export function sessionToken(message = 'Sign in to continue.'): string {
  const token = useSessionStore.getState().accessToken;
  if (!token) throw new ApiRequestError(401, message, 'unauthorized');
  return token;
}

/**
 * Whether the Closet screen reading these queries is on screen (MOB 30). Visited tabs stay
 * mounted: while this is false their queries don't refetch on focus, reconnect or invalidation
 * (TanStack `subscribed`), and catch up when the tab shows again. True outside a provider;
 * `ClosetScreenFocusProvider` (./screenFocus) sets it per tab.
 */
export const ClosetScreenFocus = createContext(true);

export function useClosetSubscribed(): boolean {
  return useContext(ClosetScreenFocus);
}

const MINUTE = 60_000;

/**
 * How long each Closet domain's data stays fresh. The QueryClient default (30s) covers the rest.
 * Live pipelines (ingestion, refunds in flight) refresh sooner; reference data much later.
 */
export const CLOSET_STALE_TIMES: Record<string, number> = {
  // Live pipelines
  'ingestion-status': 15_000,
  'ingestion-sources': 15_000,
  'ingestion-metrics': 15_000,
  'ingestion-activity': 15_000,
  'refund-eta-board': 15_000,
  // The closet itself and the day's plan
  wardrobe: 2 * MINUTE,
  'wardrobe-lent': 2 * MINUTE,
  'wardrobe-capsule': 2 * MINUTE,
  'today-outfit': 5 * MINUTE,
  'week-outfits': 5 * MINUTE,
  'waste-summary': 5 * MINUTE,
  'waste-dead': 5 * MINUTE,
  'rewear-streak': 5 * MINUTE,
  // Money: lists change only through the user's own writes, which invalidate them
  'gift-cards': 2 * MINUTE,
  receipts: 2 * MINUTE,
  purchases: 2 * MINUTE,
  'importable-purchases': 2 * MINUTE,
  returns: MINUTE,
  'return-detail': MINUTE,
  packages: MINUTE,
  warranties: 5 * MINUTE,
  'emi-plans': 5 * MINUTE,
  'cashback-claims': 5 * MINUTE,
  budgets: 5 * MINUTE,
  'accountant-summary': 5 * MINUTE,
  'accountant-ledger': 5 * MINUTE,
  'accountant-roi-season': 30 * MINUTE,
  // Reference data
  'closet-profiles': 10 * MINUTE,
  templates: 60 * MINUTE,
  'returns-size-map': 60 * MINUTE,
  'fit-tailors': 30 * MINUTE,
  measurements: 30 * MINUTE,
  households: 10 * MINUTE,
};

/**
 * Registers the per-domain stale times on the app's QueryClient. Domains saved to the device
 * stay in memory as long as the saved copy lasts, so a later save doesn't drop them.
 */
export function applyClosetQueryDefaults(queryClient: QueryClient) {
  for (const [domain, staleTime] of Object.entries(CLOSET_STALE_TIMES)) {
    queryClient.setQueryDefaults(
      [domain],
      PERSISTED_QUERY_DOMAINS.has(domain)
        ? { staleTime, gcTime: QUERY_CACHE_MAX_AGE_MS }
        : { staleTime },
    );
  }
}
