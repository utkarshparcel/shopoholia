import { useQuery } from '@tanstack/react-query';
import { COIN_PACKS } from '@worn/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { userIdFromAccessToken } from '@/src/lib/access-token';
import { useSessionStore } from '@/src/stores/session';

import { fetchCoinPacks, PurchaseApiError, storeAvailable, type CoinPacksOffer } from './api';
import { getPurchasesClient, purchaseQueue } from './purchases';
import type { ConfirmResult } from './queue';
import type { PurchasesClient } from './types';

export type ShopPack = {
  id: string;
  storeProductId: string;
  coins: number;
  label: string;
  /** The store's localized price; a sample figure only from the __DEV__ client. */
  priceString: string;
  sample: boolean;
  popular: boolean;
  bestValue: boolean;
};

export type ShopView =
  | { status: 'signed_out' }
  /** No store billing on this device, or the store sells none of the packs. */
  | { status: 'no_store' }
  | { status: 'loading' }
  /** The server can't verify this store's purchases right now (`stores[store]: false`, or 503). */
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; packs: ShopPack[] };

export type ShopNotice =
  | { kind: 'added'; coins: number; balanceAfter: number }
  | { kind: 'pending' }
  /** Paid, not confirmed yet: offline, 5xx, 503, or the store hasn't caught up. */
  | { kind: 'confirming' }
  | { kind: 'conflict' }
  | { kind: 'refunded' }
  | { kind: 'rejected' }
  | { kind: 'failed' };

/** What to tell the user about a purchase result; null when there's nothing to say. */
export function noticeForResult(result: ConfirmResult): ShopNotice | null {
  switch (result.status) {
    case 'confirmed':
      // Refunded later: the server already took the coins back; the balance refresh says enough.
      if (!result.coins || result.coins.refunded) return null;
      return { kind: 'added', coins: result.coins.coinsGranted, balanceAfter: result.coins.balanceAfter };
    case 'conflict':
      return { kind: 'conflict' };
    case 'refunded':
      return { kind: 'refunded' };
    case 'rejected':
      return { kind: 'rejected' };
    case 'waiting':
      return result.reason === 'pending' ? { kind: 'pending' } : { kind: 'confirming' };
  }
}

type ShopLoad = { status: 'unavailable' } | { status: 'ready'; packs: ShopPack[] };

export async function loadShop(client: PurchasesClient): Promise<ShopLoad> {
  let offer: CoinPacksOffer;
  try {
    offer = await fetchCoinPacks();
  } catch (error) {
    if (error instanceof PurchaseApiError && error.failure === 'unavailable') return { status: 'unavailable' };
    throw error;
  }
  // Don't start a store purchase the server can't credit.
  if (!storeAvailable(offer, client.store)) return { status: 'unavailable' };
  const products = await client.getProducts(offer.packs.map((o) => o.storeProductId));
  const byId = new Map(products.map((p) => [p.storeProductId, p]));
  const packs = offer.packs.flatMap((pack): ShopPack[] => {
    const product = byId.get(pack.storeProductId);
    // A pack the store doesn't return is hidden. Only the simulated store may show a sample price.
    if (!product || (product.sample && client.kind !== 'dev')) return [];
    const meta = COIN_PACKS.find((p) => p.id === pack.id);
    return [
      {
        id: pack.id,
        storeProductId: pack.storeProductId,
        coins: pack.coins,
        label: pack.label ?? meta?.label ?? `${pack.coins.toLocaleString()} coins`,
        priceString: product.priceString,
        sample: Boolean(product.sample),
        popular: pack.popular ?? Boolean(meta && 'popular' in meta && meta.popular),
        bestValue: pack.bestValue ?? Boolean(meta && 'bestValue' in meta && meta.bestValue),
      },
    ];
  });
  return { status: 'ready', packs };
}

/** The coin shop: packs with store prices, the purchase flow, and what to tell the user. */
export function useCoinShop() {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const client = getPurchasesClient();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ShopNotice | null>(null);
  const [confirmingProductIds, setConfirmingProductIds] = useState<string[]>([]);
  const busy = useRef(false);

  const shop = useQuery({
    queryKey: ['coins', 'shop', userId, client?.kind ?? 'none'],
    queryFn: () => loadShop(client!),
    enabled: Boolean(userId && client),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = () => {
      void purchaseQueue.list(userId).then((entries) => {
        if (!active) return;
        setConfirmingProductIds(entries.filter((e) => e.kind === 'coins').map((e) => e.productId));
      });
    };
    refresh();
    const stopChange = purchaseQueue.onChange(refresh);
    const stopResult = purchaseQueue.onResult((result) => {
      if (result.entry.userId === userId && result.entry.kind === 'coins') {
        setNotice(noticeForResult(result));
      }
    });
    return () => {
      active = false;
      stopChange();
      stopResult();
    };
  }, [userId]);

  const buy = useCallback(
    async (pack: ShopPack) => {
      if (!client || !userId || busy.current) return;
      busy.current = true;
      setPurchasingId(pack.id);
      setNotice(null);
      try {
        await client.configure(userId);
        const outcome = await client.purchase(pack.storeProductId);
        if (outcome.status === 'cancelled') return;
        if (outcome.status === 'pending') {
          setNotice({ kind: 'pending' });
          return;
        }
        // Saved before it is sent, so the payment survives a failed request or a killed app.
        const entry = await purchaseQueue.add(outcome.transaction, userId, 'coins');
        setNotice(noticeForResult(await purchaseQueue.confirm(entry)));
      } catch {
        setNotice({ kind: 'failed' });
      } finally {
        busy.current = false;
        setPurchasingId(null);
      }
    },
    [client, userId],
  );

  const checkAgain = useCallback(() => {
    if (userId) void purchaseQueue.drain(userId);
  }, [userId]);

  let view: ShopView;
  if (!userId) view = { status: 'signed_out' };
  else if (!client) view = { status: 'no_store' };
  else if (shop.data?.status === 'unavailable') view = { status: 'unavailable' };
  else if (shop.data?.status === 'ready') {
    view = shop.data.packs.length > 0 ? { status: 'ready', packs: shop.data.packs } : { status: 'no_store' };
  } else if (shop.isError) view = { status: 'error' };
  else view = { status: 'loading' };

  return {
    view,
    notice,
    purchasingId,
    confirmingProductIds,
    buy,
    checkAgain,
    reload: () => void shop.refetch(),
    dismissNotice: () => setNotice(null),
  };
}
