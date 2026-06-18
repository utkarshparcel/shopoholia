import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchCoinBalance,
  fetchReveal,
  unlockRenders,
  type RenderCard,
} from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

export function useReveal(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['reveal', orderId, accessToken],
    queryFn: () => {
      if (!accessToken) throw new Error('Sign in to view your reveal');
      return fetchReveal(accessToken, orderId);
    },
    enabled: Boolean(accessToken && orderId),
  });
}

export function useUnlockRenders(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (renderIds: string[]) => {
      if (!accessToken) throw new Error('Sign in to unlock renders');
      return unlockRenders(accessToken, orderId, renderIds);
    },
    onSuccess: async (result) => {
      if (!accessToken) return;
      const balance = await fetchCoinBalance(accessToken);
      setCoinBalance(balance.balance);
      queryClient.setQueryData(['coins', 'balance', accessToken], balance);
      queryClient.setQueryData(['reveal', orderId, accessToken], (prev: { renders: RenderCard[] } | undefined) => {
        if (!prev) return prev;
        const byId = new Map(result.renders.map((r) => [r.id, r]));
        return {
          ...prev,
          renders: prev.renders.map((r) => byId.get(r.id) ?? r),
        };
      });
    },
  });
}
