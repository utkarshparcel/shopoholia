import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiRequestError,
  createOrder,
  fetchCoinBalance,
  fetchOrder,
  rushOrder,
  type OrderSummary,
} from '@/src/api/client';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}`;
}

export function useCoinBalance() {
  const accessToken = useSessionStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['coins', 'balance', accessToken],
    queryFn: () => {
      if (!accessToken) return { balance: 0 };
      return fetchCoinBalance(accessToken);
    },
    enabled: Boolean(accessToken),
  });
}

export function useCheckout() {
  const accessToken = useSessionStore((s) => s.accessToken);
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
        queryClient.setQueryData(['coins', 'balance', accessToken], balance);
        queryClient.invalidateQueries({ queryKey: ['cart', accessToken] });
        queryClient.setQueryData(['order', order.id, accessToken], order);
      }
    },
  });
}

export function useOrder(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['order', orderId, accessToken],
    queryFn: () => {
      if (!accessToken) throw new Error('Sign in to track your order');
      return fetchOrder(accessToken, orderId);
    },
    enabled: Boolean(accessToken && orderId),
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
      queryClient.setQueryData(['coins', 'balance', accessToken], { balance: balanceAfter });
      queryClient.setQueryData(['order', order.id, accessToken], order);
      void queryClient.invalidateQueries({ queryKey: ['orders', accessToken] });
    },
    onError: async () => {
      // A refusal means the order or the balance isn't what this screen showed: reload both.
      if (!accessToken) return;
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['order', orderId, accessToken] }),
        fetchCoinBalance(accessToken).then((balance) => {
          setCoinBalance(balance.balance);
          queryClient.setQueryData(['coins', 'balance', accessToken], balance);
        }),
      ]);
    },
  });
}
