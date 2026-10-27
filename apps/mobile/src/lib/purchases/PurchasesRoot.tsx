import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { orderKeys } from '@/src/hooks/orders';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { trackEvent } from '@/src/lib/analytics';
import { captureException } from '@/src/lib/sentry';
import { useSessionStore } from '@/src/stores/session';

import { entitlementKeys } from './api';
import { onAppActive, onNetworkRegained } from './appActive';
import { DevPurchaseSheet } from './DevPurchaseSheet';
import { getPurchasesClient, purchaseKindFor, purchaseQueue } from './purchases';

/** Floor for the backoff timer, so a storage failure can't turn it into a busy loop. */
const MIN_RETRY_MS = 1_000;

/**
 * Mounted once at the root. For the signed-in user it ties the store client to their Worn id,
 * saves transactions the store delivers later (approved Ask to Buy, unfinished at launch), and
 * retries unconfirmed purchases on start, with backoff while the app stays open, when the network
 * comes back and whenever the app returns to the foreground. Coins and entitlements change only
 * from server responses.
 */
export function PurchasesRoot() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));

  useEffect(
    () =>
      purchaseQueue.onResult((result) => {
        if (result.status === 'rejected' || result.status === 'refunded') {
          // The server's 400 / 402 verdicts. Never the jws or purchase token: they go only to the Worn API.
          captureException(new Error('Store purchase rejected by the server'), {
            area: 'iap',
            store: result.entry.store,
            productId: result.entry.productId,
            transactionId: result.entry.transactionId,
            kind: result.entry.kind,
            status: result.status === 'refunded' ? '402' : String(result.httpStatus ?? 'none'),
            code: result.status === 'refunded' ? 'purchase_refunded' : (result.code ?? 'none'),
          });
          return;
        }
        if (result.status !== 'confirmed') return;
        const owner = result.entry.userId;
        if (result.coins) {
          queryClient.setQueryData(orderKeys.balance(owner), { balance: result.coins.balanceAfter });
          if (userIdFromAccessToken(useSessionStore.getState().accessToken) === owner) {
            useSessionStore.getState().setCoinBalance(result.coins.balanceAfter);
          }
          if (!result.coins.refunded && !result.coins.alreadyGranted) {
            trackEvent('iap_purchase', {
              productId: result.entry.productId,
              coins: result.coins.coinsGranted,
            });
          }
        }
        if (result.snapshot) {
          queryClient.setQueryData(entitlementKeys.snapshot(owner), result.snapshot);
          trackEvent('paywall_trial_started', { grants: result.snapshot.grants.length });
        }
      }),
    [queryClient],
  );

  useEffect(() => {
    if (!userId) return;
    const signedIn = userId;
    const client = getPurchasesClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    // Re-arms the timer from the queue's backoff; a null delay waits for the next foreground.
    const schedule = async () => {
      const delay = await purchaseQueue.nextRetryDelay(userId).catch(() => null);
      if (stopped) return;
      clearTimer();
      if (delay !== null) timer = setTimeout(retry, Math.max(delay, MIN_RETRY_MS));
    };
    function retry() {
      clearTimer();
      void purchaseQueue.drain(signedIn).then(schedule, schedule);
    }
    const stopListening = client?.onTransaction((transaction) => {
      void purchaseQueue
        .add(transaction, userId, purchaseKindFor(transaction.productId))
        .then(retry, () => undefined);
    });
    // A purchase confirmed from a screen can come back waiting too.
    const stopResults = purchaseQueue.onResult((result) => {
      if (result.entry.userId === userId && result.status === 'waiting') void schedule();
    });
    void client?.configure(userId).catch(() => undefined);
    retry();
    const stopActive = onAppActive(() => {
      retry();
      // Renewals, expiry and refunds reach the server from the stores, not from the app.
      void queryClient.invalidateQueries({ queryKey: entitlementKeys.snapshot(signedIn) });
    });
    const stopNetwork = onNetworkRegained(retry);
    return () => {
      stopped = true;
      clearTimer();
      stopListening?.();
      stopResults();
      stopActive();
      stopNetwork();
    };
  }, [userId, queryClient]);

  return __DEV__ ? <DevPurchaseSheet /> : null;
}
