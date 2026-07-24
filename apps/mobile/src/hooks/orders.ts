import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createOrder,
  fetchCoinBalance,
  fetchOrder,
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
