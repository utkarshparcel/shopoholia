import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

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
import { newIdempotencyKey } from '@/src/lib/idempotency';
import { useSessionStore } from '@/src/stores/session';

/** Keyed on the shopper, not their token, so a token renewal keeps the cache. */
export const orderKeys = {
  balance: (userId: string | null) => ['coins', 'balance', userId] as const,
  list: (userId: string | null) => ['orders', userId] as const,
  detail: (orderId: string, userId: string | null) => ['order', orderId, userId] as const,
};

/**
 * Reloads the coin balance after a spend into both places screens read it from (the query cache
 * and the session store). Fire-and-forget: it never throws, so a spend the server already made
 * can't be reported as failed because this follow-up request failed.
 */
export function refreshCoinBalance(
  queryClient: QueryClient,
  accessToken: string,
  userId: string | null,
  setCoinBalance: (balance: number) => void,
) {
  void fetchCoinBalance(accessToken).then(
    (balance) => {
      setCoinBalance(balance.balance);
      queryClient.setQueryData(orderKeys.balance(userId), balance);
    },
    () => {
      // Shown values may lag; mark them stale so the next screen that reads them reloads.
      void queryClient.invalidateQueries({ queryKey: orderKeys.balance(userId) });
    },
  );
}

/** Sets a balance the server just reported (a claim or a spend response) everywhere it's shown. */
export function applyCoinBalance(
  queryClient: QueryClient,
  userId: string | null,
  setCoinBalance: (balance: number) => void,
  balance: number,
) {
  setCoinBalance(balance);
  queryClient.setQueryData(orderKeys.balance(userId), { balance });
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

/** What's in the haul, for `useCheckout`: a different haul is a different checkout. */
export function haulKeyOf(items: ReadonlyArray<{ variantId: string; quantity: number }>, coinTotal: number) {
  return `${items.map((i) => `${i.variantId}x${i.quantity}`).join(',')}=${coinTotal}`;
}

/**
 * Places the order for the haul `haulKey` describes. Every try for that haul, including a retry
 * after a timeout or a dropped response, sends the same idempotency key, so the server places the
 * order once and answers a retry with it. The key is new once an order is placed or the haul
 * changes.
 */
export function useCheckout(haulKey = '') {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const queryClient = useQueryClient();
  const attempt = useRef<{ haulKey: string; idempotencyKey: string } | null>(null);

  return useMutation({
    mutationFn: (input: OrderSummary['tier'] | { tier: OrderSummary['tier']; coolingOffOverride?: boolean }) => {
      if (!accessToken) throw new Error('Sign in to checkout');
      const tier = typeof input === 'string' ? input : input.tier;
      const coolingOffOverride = typeof input === 'string' ? undefined : input.coolingOffOverride;
      if (attempt.current?.haulKey !== haulKey) {
        attempt.current = { haulKey, idempotencyKey: newIdempotencyKey() };
      }
      return createOrder(accessToken, tier, attempt.current.idempotencyKey, coolingOffOverride);
    },
    // The order is placed once this resolves: a failed balance refresh must not report it as
    // failed (the screen would stay on a haul the server already emptied).
    onSuccess: (order) => {
      attempt.current = null;
      trackEvent('checkout', { orderId: order.id, tier: order.tier, coinTotal: order.coinTotal });
      queryClient.setQueryData(orderKeys.detail(order.id, userId), order);
      void queryClient.invalidateQueries({ queryKey: cartKey(userId) });
      void queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) });
      if (accessToken) refreshCoinBalance(queryClient, accessToken, userId, setCoinBalance);
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
    // Polls while the order is moving; a ready, cancelled or failed order won't change again.
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && !SETTLED_ORDER_STATES.has(state) ? 5_000 : false;
    },
  });
}

/** Order states that no longer change. */
export const SETTLED_ORDER_STATES: ReadonlySet<OrderSummary['state']> = new Set([
  'REVEAL_READY',
  'CANCELLED',
  'FAILED',
]);

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
