import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  addToCart,
  fetchCart,
  fetchFeed,
  fetchFeedCategories,
  fetchListing,
  removeFromCart,
  requestTryon,
} from '@/src/api/client';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';

/** Keyed on the shopper, not their token, so a token renewal keeps the cached haul. */
export const cartKey = (userId: string | null) => ['cart', userId] as const;

/** `category` null/undefined means the whole catalog. */
export function useFeed(limit = 20, category?: string | null) {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));

  return useInfiniteQuery({
    // The shopper is in the key so signing in or out refetches with (or without) style ranking.
    queryKey: ['feed', limit, category ?? null, userId],
    queryFn: ({ pageParam }) =>
      fetchFeed(pageParam, limit, undefined, {
        category,
        accessToken: useSessionStore.getState().accessToken,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useFeedCategories() {
  return useQuery({
    queryKey: ['feed-categories'],
    queryFn: fetchFeedCategories,
  });
}

/** Shared with the feed's quick add, so it and the listing screen read one cache entry. */
export const listingQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['listing', id],
    queryFn: () => fetchListing(id),
  });

export function useListing(id: string) {
  return useQuery({
    ...listingQueryOptions(id),
    enabled: Boolean(id),
  });
}

const TRYON_POLL_MS = 2_000;
const TRYON_POLL_LIMIT_MS = 60_000;

/**
 * Requests a try-on and, while it's still processing, asks again every 2s for up to a minute.
 * Asking again is safe: the API reports on the job it already started instead of starting another.
 */
export function useTryon(listingId: string, variantId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  // Stops the run that's polling, if there is one.
  const stopPolling = useRef<(() => void) | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || !variantId) {
        throw new Error('Sign in and select a size to try on');
      }
      stopPolling.current?.();
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let wake: (() => void) | undefined;
      const stop = () => {
        stopped = true;
        clearTimeout(timer);
        wake?.();
      };
      stopPolling.current = stop;
      try {
        const deadline = Date.now() + TRYON_POLL_LIMIT_MS;
        let result = await requestTryon(accessToken, listingId, variantId);
        while (result.status === 'PROCESSING' && !stopped) {
          if (Date.now() >= deadline) {
            throw new Error('Your try-on is taking longer than usual. Try again in a little while.');
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            timer = setTimeout(resolve, TRYON_POLL_MS);
          });
          if (stopped) break;
          try {
            // The token may have been renewed while this waited.
            result = await requestTryon(
              useSessionStore.getState().accessToken ?? accessToken,
              listingId,
              variantId,
            );
          } catch (error) {
            // A dropped run has nobody to tell.
            if (stopped) break;
            throw error;
          }
        }
        return result;
      } finally {
        if (stopPolling.current === stop) stopPolling.current = null;
      }
    },
  });

  // Leaving the screen or picking another size drops a try-on that's still processing.
  const { reset } = mutation;
  useEffect(
    () => () => {
      if (!stopPolling.current) return;
      stopPolling.current();
      reset();
    },
    [listingId, variantId, reset],
  );

  return mutation;
}

/** Adds to the haul without subscribing to it, for screens that don't show the haul. */
export function useAddToCart() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { variantId: string; quantity?: number }) => {
      if (!accessToken) throw new Error('Sign in to add items to your haul');
      return addToCart(accessToken, input.variantId, input.quantity ?? 1);
    },
    onSuccess: (data, input) => {
      queryClient.setQueryData(cartKey(userId), data);
      trackEvent('add_to_cart', {
        variantId: input.variantId,
        quantity: input.quantity ?? 1,
        coinTotal: data.coinTotal,
      });
    },
  });
}

export function useCart() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: cartKey(userId),
    queryFn: () => {
      const token = useSessionStore.getState().accessToken;
      if (!token) return { items: [], coinTotal: 0 };
      return fetchCart(token);
    },
    enabled: Boolean(accessToken),
  });

  const addMutation = useAddToCart();

  const removeMutation = useMutation({
    mutationFn: (variantId: string) => {
      if (!accessToken) throw new Error('Sign in to update your haul');
      return removeFromCart(accessToken, variantId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(cartKey(userId), data);
    },
  });

  return { query, addMutation, removeMutation };
}
