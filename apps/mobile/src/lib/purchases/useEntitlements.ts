import { useQuery } from '@tanstack/react-query';
import { isGrantActive, type ClosetEntitlement } from '@worn/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchEntitlementOfferings } from '@/src/api/client';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { FEATURE_PREMIUM_GATES, WORN_REGION } from '@/src/lib/features';
import { PREMIUM_PRODUCT_ID } from '@/src/lib/paywall';
import { useSessionStore } from '@/src/stores/session';

import { entitlementKeys, fetchEntitlements, storeAvailable } from './api';
import { canAccessClosetPremium } from './premiumAccess';
import { premiumStoreProductIdFor } from './products';
import { getPurchasesClient, purchaseQueue } from './purchases';
import type { ConfirmResult } from './queue';
import type { PurchaseStore } from './types';

/** The server's verified entitlements for the signed-in user. */
export function useEntitlementSnapshot(opts?: { enabled?: boolean }) {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  return useQuery({
    queryKey: entitlementKeys.snapshot(userId),
    queryFn: fetchEntitlements,
    enabled: Boolean(userId) && opts?.enabled !== false,
  });
}

/**
 * Whether a premium surface is open: always with gates off, otherwise only once the server's
 * snapshot grants it. Pass `allowed` as `enabled` to the surface's queries.
 */
export function usePremiumAccess(surface: ClosetEntitlement): { allowed: boolean; checking: boolean } {
  const snapshot = useEntitlementSnapshot({ enabled: FEATURE_PREMIUM_GATES });
  if (!FEATURE_PREMIUM_GATES) return { allowed: true, checking: false };
  return {
    allowed: canAccessClosetPremium(surface, snapshot.data ?? null),
    checking: snapshot.isLoading,
  };
}

export type PremiumNotice =
  | { kind: 'active' }
  | { kind: 'pending' }
  | { kind: 'confirming' }
  | { kind: 'conflict' }
  | { kind: 'refunded' }
  /** 402 subscription_inactive: verified, but expired or revoked. */
  | { kind: 'inactive' }
  | { kind: 'rejected' }
  | { kind: 'failed' }
  | { kind: 'nothing_to_restore' };

export function premiumNoticeFor(result: ConfirmResult): PremiumNotice {
  switch (result.status) {
    case 'confirmed':
      return { kind: 'active' };
    case 'conflict':
      return { kind: 'conflict' };
    case 'refunded':
      return { kind: 'refunded' };
    case 'rejected':
      return result.code === 'subscription_inactive' ? { kind: 'inactive' } : { kind: 'rejected' };
    case 'waiting':
      return result.reason === 'pending' ? { kind: 'pending' } : { kind: 'confirming' };
  }
}

type Offerings = Awaited<ReturnType<typeof fetchEntitlementOfferings>>;

/**
 * Whether the server can verify a subscription bought through `store` now. Only `provider: "store"`
 * can; `"none"`, an older server's `"upi"`/`"revenuecat"`, or `stores[store]: false` disables
 * Subscribe (iap-contract.md, section 5).
 */
export function subscriptionsAvailable(offerings: Offerings | null, store: PurchaseStore): boolean {
  if (!offerings || (offerings.provider as string) !== 'store') return false;
  const { stores } = offerings as { stores?: Record<PurchaseStore, boolean> };
  return storeAvailable({ purchasesAvailable: true, stores: stores ?? null }, store);
}

/** Closet Premium through the store: price, subscribe, Restore Purchases. */
export function usePremiumPurchase() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = userIdFromAccessToken(accessToken);
  const client = getPurchasesClient();
  const [busy, setBusy] = useState<'subscribe' | 'restore' | null>(null);
  const [notice, setNotice] = useState<PremiumNotice | null>(null);
  const working = useRef(false);

  const snapshot = useEntitlementSnapshot();
  const offerings = useQuery({
    queryKey: ['entitlements', 'offerings', userId],
    queryFn: () =>
      fetchEntitlementOfferings(
        accessToken!,
        WORN_REGION === 'US' || WORN_REGION === 'GLOBAL' ? WORN_REGION : 'IN',
      ),
    enabled: Boolean(accessToken),
  });
  const offered = offerings.data?.offerings.find((o) => o.productId === PREMIUM_PRODUCT_ID) as
    | { storeProductId?: string }
    | undefined;
  const storeProductId = offered?.storeProductId ?? premiumStoreProductIdFor(PREMIUM_PRODUCT_ID)!;
  const product = useQuery({
    queryKey: ['entitlements', 'store-product', client?.kind ?? 'none', storeProductId],
    queryFn: async () => {
      const [found] = await client!.getProducts([storeProductId]);
      // Only the simulated store may show a sample price.
      return found && !(found.sample && client!.kind !== 'dev') ? found : null;
    },
    enabled: Boolean(userId && client),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!userId) return;
    return purchaseQueue.onResult((result) => {
      if (result.entry.userId === userId && result.entry.kind === 'subscription') {
        setNotice(premiumNoticeFor(result));
      }
    });
  }, [userId]);

  const run = useCallback(
    async (kind: 'subscribe' | 'restore') => {
      if (!client || !userId || working.current) return;
      working.current = true;
      setBusy(kind);
      setNotice(null);
      try {
        await client.configure(userId);
        if (kind === 'subscribe') {
          const outcome = await client.purchase(storeProductId);
          if (outcome.status === 'cancelled') return;
          if (outcome.status === 'pending') {
            setNotice({ kind: 'pending' });
            return;
          }
          const entry = await purchaseQueue.add(outcome.transaction, userId, 'subscription');
          setNotice(premiumNoticeFor(await purchaseQueue.confirm(entry)));
          return;
        }
        const owned = await client.restore();
        if (owned.length === 0) {
          setNotice({ kind: 'nothing_to_restore' });
          return;
        }
        let last: ConfirmResult | null = null;
        for (const transaction of owned) {
          last = await purchaseQueue.confirm(await purchaseQueue.add(transaction, userId, 'subscription'));
        }
        if (last) setNotice(premiumNoticeFor(last));
      } catch {
        setNotice({ kind: 'failed' });
      } finally {
        working.current = false;
        setBusy(null);
        void snapshot.refetch();
      }
    },
    [client, userId, snapshot, storeProductId],
  );

  const active = Boolean(
    snapshot.data?.grants.some((g) => g.productId === PREMIUM_PRODUCT_ID && isGrantActive(g)),
  );

  return {
    available: Boolean(client) && product.data != null,
    /** False while the server can't verify this store's subscriptions: Subscribe is disabled. */
    purchasable: Boolean(client) && subscriptionsAvailable(offerings.data ?? null, client?.store ?? 'app_store'),
    loading: offerings.isLoading || product.isLoading || snapshot.isLoading,
    offerings: offerings.data ?? null,
    product: product.data ?? null,
    active,
    busy,
    notice,
    subscribe: () => run('subscribe'),
    restore: () => run('restore'),
    reload: () => {
      void offerings.refetch();
      void product.refetch();
      void snapshot.refetch();
    },
  };
}
