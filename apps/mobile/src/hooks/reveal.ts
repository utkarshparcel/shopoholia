import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import {
  fetchCoinBalance,
  fetchReveal,
  generateRenders,
  retryRenders,
  unlockRenders,
  type RenderCard,
} from '@/src/api/client';
import { orderKeys } from '@/src/hooks/orders';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { newIdempotencyKey } from '@/src/lib/idempotency';
import { hasRendersInProgress } from '@/src/lib/reveal';
import { useSessionStore } from '@/src/stores/session';

/** Keyed on the shopper, not their token, so a token renewal keeps the cached reveal. */
const revealKey = (orderId: string, userId: string | null) => ['reveal', orderId, userId] as const;

export function useReveal(orderId: string) {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const signedIn = useSessionStore((s) => Boolean(s.accessToken));

  return useQuery({
    queryKey: revealKey(orderId, userId),
    queryFn: () => {
      const accessToken = useSessionStore.getState().accessToken;
      if (!accessToken) throw new Error('Sign in to view your reveal');
      return fetchReveal(accessToken, orderId);
    },
    enabled: signedIn && Boolean(orderId),
    refetchInterval: (query) =>
      hasRendersInProgress(query.state.data?.renders ?? []) ? 2500 : false,
  });
}

export function useUnlockRenders(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const queryClient = useQueryClient();
  // One key per unlock of a set of renders, kept until it succeeds: a retry, or a second tap
  // while the first is in flight, sends the same key and the server charges once.
  const pendingKeys = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: (renderIds: string[]) => {
      if (!accessToken) throw new Error('Sign in to unlock renders');
      const attempt = [...renderIds].sort().join(',');
      let idempotencyKey = pendingKeys.current.get(attempt);
      if (!idempotencyKey) {
        idempotencyKey = newIdempotencyKey();
        pendingKeys.current.set(attempt, idempotencyKey);
      }
      return unlockRenders(accessToken, orderId, renderIds, idempotencyKey);
    },
    onSuccess: async (result, renderIds) => {
      pendingKeys.current.delete([...renderIds].sort().join(','));
      if (!accessToken) return;
      const balance = await fetchCoinBalance(accessToken);
      setCoinBalance(balance.balance);
      queryClient.setQueryData(orderKeys.balance(userId), balance);
      queryClient.setQueryData(revealKey(orderId, userId), (prev: { renders: RenderCard[] } | undefined) => {
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

/** Retries a failed included look; the returned QUEUED card restarts the reveal's polling. */
export function useRetryRenders(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (renderIds: string[]) => {
      if (!accessToken) throw new Error('Sign in to retry renders');
      return retryRenders(accessToken, orderId, renderIds);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(revealKey(orderId, userId), (prev: { renders: RenderCard[] } | undefined) => {
        if (!prev) return prev;
        const byId = new Map(result.renders.map((r) => [r.id, r]));
        return { ...prev, renders: prev.renders.map((r) => byId.get(r.id) ?? r) };
      });
    },
  });
}

export function useGenerateRenders(orderId: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const setCoinBalance = useSessionStore((s) => s.setCoinBalance);
  const queryClient = useQueryClient();
  // One key per render asked for (its items and scenario), kept until it succeeds: a retry, or a
  // second tap while the first is in flight, sends the same key and the server charges once.
  const pendingKeys = useRef(new Map<string, string>());
  const attemptOf = (input: { orderItemIds: string[]; scenario: string }) =>
    `${[...new Set(input.orderItemIds)].sort().join(',')}|${input.scenario}`;

  return useMutation({
    mutationFn: (input: { orderItemIds: string[]; scenario: string }) => {
      if (!accessToken) throw new Error('Sign in to generate renders');
      const attempt = attemptOf(input);
      let idempotencyKey = pendingKeys.current.get(attempt);
      if (!idempotencyKey) {
        idempotencyKey = newIdempotencyKey();
        pendingKeys.current.set(attempt, idempotencyKey);
      }
      return generateRenders(accessToken, orderId, input.orderItemIds, input.scenario, idempotencyKey);
    },
    onSuccess: async (result, input) => {
      pendingKeys.current.delete(attemptOf(input));
      if (!accessToken) return;
      const balance = await fetchCoinBalance(accessToken);
      setCoinBalance(balance.balance);
      queryClient.setQueryData(orderKeys.balance(userId), balance);
      queryClient.setQueryData(revealKey(orderId, userId), (prev: { renders: RenderCard[] } | undefined) => {
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
