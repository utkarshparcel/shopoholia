/**
 * Store connections from env and the per-store purchase verifiers (contract:
 * FIX/platform/iap-contract.md).
 *
 * - App Store: APPLE_BUNDLE_ID. Transactions are verified locally, so no Apple key is needed. Outside
 *   production, IAP_ALLOW_XCODE=1 with IAP_XCODE_CERT_PEM also accepts StoreKit Testing in Xcode.
 * - Google Play: ANDROID_PACKAGE_NAME and GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (a service account with
 *   access to the app in Play Console).
 */

import { X509Certificate } from "node:crypto";
import {
  coinPackByStoreProductId,
  premiumSubscriptionByStoreProductId,
} from "@worn/shared";
import type {
  PurchaseVerifier,
  Rejected,
  VerifiedSubscription,
  VerifyPurchaseResult,
  VerifySubscriptionResult,
} from "../coin-purchases.js";
import { appAccountTokenForUser, playAccountIdForUser } from "./accounts.js";
import {
  appleEnvironment,
  appleRootCertificates,
  toAppleTransaction,
  verifyAppleJws,
  type AppleJwsTrust,
  type AppleTransaction,
} from "./apple.js";
import {
  createPlayClient,
  isPlayNotFound,
  parseServiceAccount,
  type PlayClient,
} from "./google-play.js";

export type AppleStoreConfig = {
  bundleId: string;
  production: boolean;
  trust: AppleJwsTrust;
};

export type PlayStoreConnection = {
  packageName: string;
  production: boolean;
  client: PlayClient;
  now?: () => Date;
};

export type StoreConnections = {
  apple: AppleStoreConfig | null;
  play: PlayStoreConnection | null;
};

/** Store configuration from env; a store without its settings is null (unavailable). */
export function storeConnectionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: { fetchImpl?: typeof fetch } = {},
): StoreConnections {
  const production = env.NODE_ENV === "production";
  const bundleId = env.APPLE_BUNDLE_ID?.trim();
  const xcodePem =
    !production && env.IAP_ALLOW_XCODE === "1" ? env.IAP_XCODE_CERT_PEM?.replaceAll("\\n", "\n") : undefined;
  const apple: AppleStoreConfig | null = bundleId
    ? {
        bundleId,
        production,
        trust: {
          roots: appleRootCertificates(),
          xcodeCert: xcodePem ? new X509Certificate(xcodePem) : null,
        },
      }
    : null;

  const packageName = env.ANDROID_PACKAGE_NAME?.trim();
  const serviceAccount = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    ? parseServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
    : null;
  const play: PlayStoreConnection | null =
    packageName && serviceAccount
      ? {
          packageName,
          production,
          client: createPlayClient({
            serviceAccount,
            allowEndpointOverrides: !production,
            apiBaseUrl: env.GOOGLE_PLAY_API_BASE_URL,
            fetchImpl: opts.fetchImpl,
          }),
        }
      : null;
  return { apple, play };
}

function reject(reason: Rejected["reason"], message: string): Rejected {
  return { ok: false, reason, message };
}

const NOT_BOUND = "The purchase isn't tied to a Worn account";
const OTHER_ACCOUNT = "This purchase belongs to another Worn account";
const TEST_PURCHASE = "Test purchases aren't accepted by this server";

/** App Store: StoreKit 2 signed transactions, checked locally. */
export function createAppleVerifier(config: AppleStoreConfig): PurchaseVerifier {
  function readTransaction(
    jws: string | undefined,
    userId: string,
  ):
    | { ok: true; tx: AppleTransaction; environment: "production" | "sandbox" | "xcode" }
    | Rejected {
    if (!jws) return reject("missing_proof", "jws is required for App Store purchases");
    let tx: AppleTransaction;
    let xcode: boolean;
    try {
      const verified = verifyAppleJws(jws, config.trust);
      tx = toAppleTransaction(verified.payload);
      xcode = verified.xcode;
    } catch (error) {
      return reject("invalid_proof", error instanceof Error ? error.message : "Invalid transaction");
    }
    if (tx.bundleId !== config.bundleId) return reject("invalid_proof", "This purchase is for another app");
    const environment = appleEnvironment(tx.environment, xcode, config.production);
    if (!environment) return reject("invalid_proof", TEST_PURCHASE);
    if (!tx.appAccountToken) return reject("invalid_proof", NOT_BOUND);
    if (tx.appAccountToken !== appAccountTokenForUser(userId)) {
      return reject("purchase_belongs_to_another_account", OTHER_ACCOUNT);
    }
    return { ok: true, tx, environment };
  }

  return {
    name: "apple",
    stores: { app_store: true, play_store: false },
    async verify(input): Promise<VerifyPurchaseResult> {
      const read = readTransaction(input.proof, input.userId);
      if (!read.ok) return read;
      const { tx, environment } = read;
      if (tx.type !== "Consumable" || !coinPackByStoreProductId(tx.productId)) {
        return reject("product_mismatch", "This transaction isn't a coin pack");
      }
      if ((tx.quantity ?? 1) !== 1) return reject("product_mismatch", "Only single-quantity purchases are supported");
      if (tx.revocationDate !== undefined) return reject("purchase_refunded", "The App Store refunded this purchase");
      return {
        ok: true,
        purchase: {
          store: "app_store",
          productId: tx.productId,
          transactionId: tx.transactionId,
          environment,
          purchasedAt: tx.purchaseDate !== undefined ? new Date(tx.purchaseDate) : null,
          raw: {
            originalTransactionId: tx.originalTransactionId,
            environment: tx.environment,
            signedDate: tx.signedDate ?? null,
          },
        },
      };
    },
    async verifySubscription(input): Promise<VerifySubscriptionResult> {
      const read = readTransaction(input.proof, input.userId);
      if (!read.ok) return read;
      const { tx, environment } = read;
      if (tx.type !== "Auto-Renewable Subscription" || !premiumSubscriptionByStoreProductId(tx.productId)) {
        return reject("product_mismatch", "This transaction isn't a Closet subscription");
      }
      return { ok: true, subscription: appleSubscription(tx, environment, null, new Date()) };
    },
  };
}

/**
 * A verified App Store subscription transaction as access: revoked (refund, family sharing) ends at
 * the revocation, an upgraded one ends now (the new product carries on), otherwise it ends at the
 * later of the period's expiry and the billing grace period.
 */
export function appleSubscription(
  tx: AppleTransaction,
  environment: "production" | "sandbox" | "xcode",
  gracePeriodExpiresDate: number | null,
  now: Date,
): VerifiedSubscription {
  let expiresAt: Date | null;
  if (tx.revocationDate !== undefined) expiresAt = new Date(tx.revocationDate);
  else if (tx.isUpgraded) expiresAt = now;
  else if (tx.expiresDate !== undefined) {
    expiresAt = new Date(Math.max(tx.expiresDate, gracePeriodExpiresDate ?? 0));
  } else expiresAt = null;
  return {
    store: "app_store",
    productId: tx.productId,
    storeRef: tx.originalTransactionId,
    transactionId: tx.transactionId,
    environment,
    expiresAt,
    isTrial: tx.offerType === 1 && (tx.offerDiscountType ?? "FREE_TRIAL") === "FREE_TRIAL",
    eventAt: tx.signedDate !== undefined ? new Date(tx.signedDate) : now,
  };
}

const PLAY_ACTIVE_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  // Auto-renew is off, but access runs to the end of the paid period.
  "SUBSCRIPTION_STATE_CANCELED",
]);

/** Google Play: purchase tokens, checked with the Play Developer API. */
export function createPlayVerifier(play: PlayStoreConnection): PurchaseVerifier {
  const now = play.now ?? (() => new Date());
  function playError(error: unknown): Rejected {
    if (isPlayNotFound(error)) return reject("purchase_not_found", "Google Play doesn't know this purchase");
    return reject("unavailable", error instanceof Error ? error.message : "Google Play request failed");
  }
  function checkAccount(accountId: string | undefined, userId: string): Rejected | null {
    if (!accountId) return reject("invalid_proof", NOT_BOUND);
    if (accountId !== playAccountIdForUser(userId)) {
      return reject("purchase_belongs_to_another_account", OTHER_ACCOUNT);
    }
    return null;
  }

  return {
    name: "google_play",
    stores: { app_store: false, play_store: true },
    async verify(input): Promise<VerifyPurchaseResult> {
      const token = input.proof;
      if (!token) return reject("missing_proof", "purchaseToken is required for Google Play purchases");
      if (!coinPackByStoreProductId(input.productId)) return reject("product_mismatch", "Not a coin pack");
      let purchase;
      try {
        purchase = await play.client.getProductPurchase(play.packageName, input.productId, token);
      } catch (error) {
        return playError(error);
      }
      if (purchase.productId !== undefined && purchase.productId !== input.productId) {
        return reject("product_mismatch", "This purchase is for a different product");
      }
      const accountProblem = checkAccount(purchase.obfuscatedExternalAccountId, input.userId);
      if (accountProblem) return accountProblem;
      if (purchase.purchaseState === 2) return reject("purchase_pending", "The payment is still pending");
      if (purchase.purchaseState === 1) return reject("purchase_refunded", "Google Play canceled this purchase");
      if (purchase.purchaseState !== 0) return reject("invalid_proof", "Google Play didn't report a completed purchase");
      const test = purchase.purchaseType === 0;
      if (test && play.production) return reject("invalid_proof", TEST_PURCHASE);
      if ((purchase.quantity ?? 1) !== 1) {
        return reject("product_mismatch", "Only single-quantity purchases are supported");
      }
      const purchasedAt = purchase.purchaseTimeMillis ? new Date(Number(purchase.purchaseTimeMillis)) : null;
      return {
        ok: true,
        purchase: {
          store: "play_store",
          productId: input.productId,
          transactionId: purchase.orderId ?? token,
          environment: test ? "sandbox" : "production",
          purchasedAt,
          needsConsume: purchase.consumptionState === 0,
          raw: {
            orderId: purchase.orderId ?? null,
            purchaseType: purchase.purchaseType ?? null,
            consumptionState: purchase.consumptionState ?? null,
            acknowledgementState: purchase.acknowledgementState ?? null,
            regionCode: purchase.regionCode ?? null,
          },
        },
      };
    },
    async verifySubscription(input): Promise<VerifySubscriptionResult> {
      const token = input.proof;
      if (!token) return reject("missing_proof", "purchaseToken is required for Google Play purchases");
      let sub;
      try {
        sub = await play.client.getSubscription(play.packageName, token);
      } catch (error) {
        return playError(error);
      }
      const lineItem = sub.lineItems?.find(
        (item) => item.productId && premiumSubscriptionByStoreProductId(item.productId),
      );
      if (!lineItem?.productId) return reject("product_mismatch", "This purchase isn't a Closet subscription");
      const accountProblem = checkAccount(
        sub.externalAccountIdentifiers?.obfuscatedExternalAccountId,
        input.userId,
      );
      if (accountProblem) return accountProblem;
      const test = sub.testPurchase !== undefined;
      if (test && play.production) return reject("invalid_proof", TEST_PURCHASE);
      if (sub.subscriptionState === "SUBSCRIPTION_STATE_PENDING") {
        return reject("purchase_pending", "The payment is still pending");
      }
      const at = now();
      const expiry = lineItem.expiryTime ? new Date(lineItem.expiryTime) : null;
      const active = PLAY_ACTIVE_STATES.has(sub.subscriptionState ?? "");
      const expiresAt = active ? expiry : new Date(Math.min(expiry?.getTime() ?? at.getTime(), at.getTime()));
      return {
        ok: true,
        subscription: {
          store: "play_store",
          productId: lineItem.productId,
          storeRef: token,
          transactionId: sub.latestOrderId ?? token,
          environment: test ? "sandbox" : "production",
          expiresAt,
          isTrial: lineItem.offerPhase?.freeTrial !== undefined,
          eventAt: at,
        },
      };
    },
  };
}
