import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addToCart,
  fetchCart,
  fetchFeed,
  fetchListing,
  removeFromCart,
  requestTryon,
} from '@/src/api/client';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';

export function useFeed(limit = 20) {
  return useInfiniteQuery({
    queryKey: ['feed', limit],
    queryFn: ({ pageParam }) => fetchFeed(pageParam, limit),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => fetchListing(id),
    enabled: Boolean(id),
  });
}

export function useTryon(listingId: string, variantId: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);

  return useMutation({
    mutationFn: () => {
      if (!accessToken || !variantId) {
        throw new Error('Sign in and select a size to try on');
      }
      return requestTryon(accessToken, listingId, variantId);
    },
  });
}

export function useCart() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['cart', accessToken],
    queryFn: () => {
      if (!accessToken) return { items: [], coinTotal: 0 };
      return fetchCart(accessToken);
    },
    enabled: Boolean(accessToken),
  });

  const addMutation = useMutation({
    mutationFn: (input: { variantId: string; quantity?: number }) => {
      if (!accessToken) throw new Error('Sign in to add items to your haul');
      return addToCart(accessToken, input.variantId, input.quantity ?? 1);
    },
    onSuccess: (data, input) => {
      queryClient.setQueryData(['cart', accessToken], data);
      trackEvent('add_to_cart', {
        variantId: input.variantId,
        quantity: input.quantity ?? 1,
        coinTotal: data.coinTotal,
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (variantId: string) => {
      if (!accessToken) throw new Error('Sign in to update your haul');
      return removeFromCart(accessToken, variantId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['cart', accessToken], data);
    },
  });

  return { query, addMutation, removeMutation };
}
