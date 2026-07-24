import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchCoinBalance,
  fetchReveal,
  generateRenders,
  unlockRenders,
  type RenderCard,
  type GenerateRenderResponse,
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
    refetchInterval: (query) => {
      const renders = query.state.data?.renders ?? [];
      const pending = renders.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
      return pending ? 2500 : false;
    },
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

export function useGenerateRenders(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { orderItemIds: string[]; scenario: string }) => {
      if (!accessToken) throw new Error('Sign in to generate renders');
      return generateRenders(accessToken, orderId, input.orderItemIds, input.scenario);
    },
    onSuccess: async (result) => {
      if (!accessToken) return;
      const balance = await fetchCoinBalance(accessToken);
      setCoinBalance(balance.balance);
      queryClient.setQueryData(['coins', 'balance', accessToken], balance);
      queryClient.setQueryData(['reveal', orderId, accessToken], (prev: { renders: RenderCard[] } | undefined) => {
        if (!prev) return prev;
        const byId = new Map(result.renders.map((r) => [r.id, r]));
        const merged = prev.renders.map((r) => byId.get(r.id) ?? r);
        for (const r of result.renders) {
          if (!merged.find((m) => m.id === r.id)) {
            merged.push(r);
          }
        }
        return { ...prev, renders: merged };
      });
    },
  });
}
