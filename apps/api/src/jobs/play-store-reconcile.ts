/**
 * Daily Google Play reconcile (queue `play-store-reconcile`, payload PlayStoreReconcileJobSchema).
 * Google has no signed refund push here, so this job polls:
 *
 * 1. The Voided Purchases API (the last 30 days by default): a voided coin purchase has its coins taken
 *    back under the refund rule (never below a zero balance; the rest is recorded as a shortfall).
 * 2. Every Play subscription grant that's active, or ended in the last week, is re-checked with
 *    purchases.subscriptionsv2, and the user's premium grants are rewritten from Google's answer.
 *
 * Safe to run twice: refunds happen once per purchase, and a re-check stores the same answer again.
 */

import {
  PlayStoreReconcileJobSchema,
  mapLimit,
  type PlayStoreReconcileJob,
} from "@worn/shared";
import type { PurchaseVerifier } from "../lib/coin-purchases.js";
import { grantsForProduct, subscriptionGrants } from "../lib/entitlements.js";
import type { StoreConnections } from "../lib/iap/stores.js";
import type { Repositories } from "../lib/repositories/types.js";

export const PLAY_STORE_RECONCILE_QUEUE = "play-store-reconcile";

const DAY_MS = 24 * 60 * 60_000;
/** The Voided Purchases API reaches back 30 days at most. */
const VOIDED_LOOKBACK_MS = 30 * DAY_MS;
/** Also re-check subscriptions that ended recently: an on-hold one can recover. */
const RECHECK_ENDED_WITHIN_MS = 7 * DAY_MS;
const RECHECK_CONCURRENCY = 4;

export type PlayStoreReconcileDeps = {
  repos: Repositories;
  purchaseVerifier: PurchaseVerifier;
  storeConnections: StoreConnections;
  now?: () => Date;
};

export type PlayStoreReconcileSummary = {
  skipped?: "play_store_unconfigured";
  refunds: number;
  subscriptionsChecked: number;
  subscriptionsEnded: number;
};

export async function playStoreReconcile(
  data: PlayStoreReconcileJob,
  deps: PlayStoreReconcileDeps,
): Promise<PlayStoreReconcileSummary> {
  const job = PlayStoreReconcileJobSchema.parse(data ?? {});
  const summary: PlayStoreReconcileSummary = { refunds: 0, subscriptionsChecked: 0, subscriptionsEnded: 0 };
  const play = deps.storeConnections.play;
  if (!play) return { ...summary, skipped: "play_store_unconfigured" };
  const now = deps.now?.() ?? new Date();

  let pageToken: string | undefined;
  do {
    const page = await play.client.listVoidedPurchases(play.packageName, {
      startTimeMs: job.sinceMs ?? now.getTime() - VOIDED_LOOKBACK_MS,
      pageToken,
    });
    for (const voided of page.voidedPurchases) {
      // Coin purchases are keyed on the order id, or the token when Google gave no order id.
      for (const key of [voided.orderId, voided.purchaseToken]) {
        if (!key) continue;
        const purchase = await deps.repos.findCoinPurchase("play_store", key);
        if (!purchase) continue;
        const refund = await deps.repos.refundCoinPurchase({
          store: "play_store",
          transactionId: purchase.transactionId,
          source: "notification",
          rawPayload: {
            voidedTimeMillis: voided.voidedTimeMillis ?? null,
            voidedSource: voided.voidedSource ?? null,
            voidedReason: voided.voidedReason ?? null,
          },
        });
        if (refund.status === "refunded") summary.refunds += 1;
        break;
      }
    }
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);

  const refs = await deps.repos.listStoreSubscriptionGrants(
    "play_store",
    new Date(now.getTime() - RECHECK_ENDED_WITHIN_MS),
  );
  await mapLimit(refs, RECHECK_CONCURRENCY, async (ref) => {
    const result = await deps.purchaseVerifier.verifySubscription({
      store: "play_store",
      proof: ref.storeRef,
      userId: ref.userId,
    });
    summary.subscriptionsChecked += 1;
    if (result.ok) {
      await deps.repos.applyEntitlementGrants(ref.userId, subscriptionGrants(result.subscription));
      return;
    }
    // A Google outage fails the run, so the runner retries it; other answers are final for this token.
    if (result.reason === "unavailable") throw new Error(`Google Play re-check failed: ${result.message}`);
    if (result.reason === "purchase_not_found" || result.reason === "purchase_refunded") {
      // Google no longer knows the token (it forgets subscriptions 60 days after they end).
      await deps.repos.applyEntitlementGrants(
        ref.userId,
        grantsForProduct(ref.productId, {
          expiresAt: now,
          isTrial: false,
          source: "play_store",
          eventAt: now,
          storeRef: ref.storeRef,
        }),
      );
      summary.subscriptionsEnded += 1;
    }
  });
  return summary;
}
