import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiRequestError,
  createOrder,
  fetchCoinBalance,
  fetchOrder,
  rushOrder,
  type OrderSummary,
} from '@/src/api/client';
import { cartKey } from '@/src/hooks/catalog';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';

/** Keyed on the shopper, not their token, so a token renewal keeps the cache. */
export const orderKeys = {
  balance: (userId: string | null) => ['coins', 'balance', userId] as const,
  list: (userId: string | null) => ['orders', userId] as const,
  detail: (orderId: string, userId: string | null) => ['order', orderId, userId] as const,
};

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}`;
}

export function useCoinBalance() {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const signedIn = useSessionStore((s) => Boolean(s.accessToken));

  return useQuery({
    queryKey: orderKeys.balance(userId),
    queryFn: () => {
      const accessToken = useSessionStore.getState().accessToken;
      if (!accessToken) return { balance: 0 };
      return fetchCoinBalance(accessToken);
    },
    enabled: signedIn,
    // Streak claims and coin packs change the balance without touching this cache.
    staleTime: 0,
  });
}

export function useCheckout() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tier: OrderSummary['tier']) => {
      if (!accessToken) throw new Error('Sign in to checkout');
      return createOrder(accessToken, tier, idempotencyKey());
    },
    onSuccess: async (order) => {
      trackEvent('checkout', { orderId: order.id, tier: order.tier, coinTotal: order.coinTotal });
      if (accessToken) {
        const balance = await fetchCoinBalance(accessToken);
        setCoinBalance(balance.balance);
        queryClient.setQueryData(orderKeys.balance(userId), balance);
        queryClient.invalidateQueries({ queryKey: cartKey(userId) });
        queryClient.setQueryData(orderKeys.detail(order.id, userId), order);
        queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) });
      }
    },
  });
}

export function useOrder(orderId: string) {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const signedIn = useSessionStore((s) => Boolean(s.accessToken));

  return useQuery({
    queryKey: orderKeys.detail(orderId, userId),
    queryFn: () => {
      const accessToken = useSessionStore.getState().accessToken;
      if (!accessToken) throw new Error('Sign in to track your order');
      return fetchOrder(accessToken, orderId);
    },
    enabled: signedIn && Boolean(orderId),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && state !== 'REVEAL_READY' ? 5_000 : false;
    },
  });
}

/** True when the API turned a coin spend down for lack of coins (402). */
export function isInsufficientCoinsError(error: unknown) {
  return error instanceof ApiRequestError && error.status === 402;
}

export function useRushOrder(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!accessToken) throw new Error('Sign in to rush your order');
      return rushOrder(accessToken, orderId);
    },
    onSuccess: ({ order, balanceAfter }) => {
      trackEvent('rush_to_express', {
        orderId: order.id,
        state: order.state,
        coinsSpent: order.rushCostCoins,
      });
      setCoinBalance(balanceAfter);
      queryClient.setQueryData(orderKeys.balance(userId), { balance: balanceAfter });
      queryClient.setQueryData(orderKeys.detail(order.id, userId), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) });
    },
    onError: async () => {
      // A refusal means the order or the balance isn't what this screen showed: reload both.
      if (!accessToken) return;
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId, userId) }),
        fetchCoinBalance(accessToken).then((balance) => {
          setCoinBalance(balance.balance);
          queryClient.setQueryData(orderKeys.balance(userId), balance);
        }),
      ]);
    },
  });
}
