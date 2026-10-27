/**
 * App Store Server Notifications V2 (POST /webhooks/app-store). The signed payload and the signed
 * transaction and renewal info inside it are verified like a StoreKit transaction. Coin purchases
 * credit through the same grant function as the app's validate call; refunds take coins back under the
 * refund rule; subscription events rewrite the user's premium grants. A retried delivery changes
 * nothing: coins are keyed on the transaction id and subscription grants on `notificationUUID`.
 */

import { coinPackByStoreProductId, premiumSubscriptionByStoreProductId } from "@worn/shared";
import { creditCoinPurchase } from "../coin-purchases.js";
import { subscriptionGrants } from "../entitlements.js";
import type { Repositories } from "../repositories/types.js";
import { AppleJwsError, decodeAppStoreNotification } from "./apple.js";
import { appleSubscription, type AppleStoreConfig } from "./stores.js";

export type AppStoreNotificationResult =
  | { ok: true; applied?: string; duplicate?: boolean; ignored?: string }
  | { ok: false; reason: "unconfigured" | "invalid_signature"; message: string };

/** Subscription notifications whose signed transaction says what access the user has now. */
const SUBSCRIPTION_STATE_TYPES = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "DID_CHANGE_RENEWAL_PREF",
  "DID_CHANGE_RENEWAL_STATUS",
  "OFFER_REDEEMED",
  "DID_FAIL_TO_RENEW",
  "GRACE_PERIOD_EXPIRED",
  "EXPIRED",
  "REFUND",
  "REFUND_REVERSED",
  "REVOKE",
  "RENEWAL_EXTENDED",
]);

export async function processAppStoreNotification(
  repos: Repositories,
  apple: AppleStoreConfig | null,
  signedPayload: string,
  now: Date = new Date(),
): Promise<AppStoreNotificationResult> {
  if (!apple) {
    return { ok: false, reason: "unconfigured", message: "App Store notifications are not configured (set APPLE_BUNDLE_ID)" };
  }
  let notification;
  try {
    notification = decodeAppStoreNotification(signedPayload, apple);
  } catch (error) {
    if (!(error instanceof AppleJwsError)) throw error;
    return { ok: false, reason: "invalid_signature", message: error.message };
  }
  if (!notification) return { ok: true, ignored: "other_app_or_environment" };
  const { notificationType: type, transaction: tx } = notification;
  if (type === "TEST") return { ok: true, ignored: "test" };
  if (!tx) return { ok: true, ignored: `no_transaction:${type}` };

  // appAccountToken is the Worn user id (a UUID), set by the app at purchase.
  const user = tx.appAccountToken ? await repos.findUserById(tx.appAccountToken) : null;

  if (tx.type === "Consumable" && coinPackByStoreProductId(tx.productId)) {
    if (type === "REFUND") {
      const refund = await repos.refundCoinPurchase({
        store: "app_store",
        transactionId: tx.transactionId,
        ...(user ? { userId: user.id, productId: tx.productId } : {}),
        source: "notification",
        rawPayload: { notificationUUID: notification.notificationUUID, revocationDate: tx.revocationDate ?? null },
      });
      return refund.status === "unknown" ? { ok: true, ignored: "refund_unknown_purchase" } : { ok: true, applied: `refund:${refund.status}` };
    }
    if (type === "ONE_TIME_CHARGE") {
      if (!user) return { ok: true, ignored: "unknown_account" };
      if (tx.revocationDate !== undefined) return { ok: true, ignored: "revoked" };
      const credited = await creditCoinPurchase(
        repos,
        user.id,
        {
          store: "app_store",
          productId: tx.productId,
          transactionId: tx.transactionId,
          environment: notification.environment,
          purchasedAt: tx.purchaseDate !== undefined ? new Date(tx.purchaseDate) : null,
          raw: { notificationUUID: notification.notificationUUID, environment: tx.environment },
        },
        "notification",
      );
      return credited.status === "other_user"
        ? { ok: true, ignored: "other_account" }
        : { ok: true, applied: `coins:${credited.status}` };
    }
    return { ok: true, ignored: `coin_event:${type}` };
  }

  if (tx.type === "Auto-Renewable Subscription" && premiumSubscriptionByStoreProductId(tx.productId)) {
    if (!SUBSCRIPTION_STATE_TYPES.has(type)) return { ok: true, ignored: `subscription_event:${type}` };
    if (!user) return { ok: true, ignored: "unknown_account" };
    const sub = appleSubscription(
      tx,
      notification.environment,
      notification.renewal?.gracePeriodExpiresDate ?? null,
      now,
    );
    const { applied } = await repos.applyEntitlementGrants(
      user.id,
      subscriptionGrants(sub),
      `asn:${notification.notificationUUID}`,
    );
    return applied ? { ok: true, applied: `subscription:${type}` } : { ok: true, duplicate: true };
  }

  return { ok: true, ignored: "unknown_product" };
}
