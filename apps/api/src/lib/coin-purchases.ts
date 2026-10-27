/**
 * Store purchases: coin packs (consumables, COIN_PACKS) and Closet premium (subscriptions). The app's
 * validate call and Apple's server notification both credit coins through creditCoinPurchase, so a
 * store transaction credits once per (store, transaction id) whichever arrives first.
 *
 * Verification sits behind PurchaseVerifier: Apple (local JWS check) and Google (Play Developer API),
 * see lib/iap/stores.ts. A store with no configuration is unavailable (503 for that store only).
 */

import { coinPackByStoreProductId, type CoinPack, type IapValidateBody } from "@worn/shared";
import { createAppleVerifier, createPlayVerifier, type StoreConnections } from "./iap/stores.js";
import type {
  CoinPurchaseRecord,
  CoinPurchaseStore,
  CreditCoinPurchaseResult,
  Repositories,
} from "./repositories/types.js";

/** A purchase as the store reported it. Its transactionId is the credit-once key. */
export type VerifiedPurchase = {
  store: CoinPurchaseStore;
  /** Store product id. */
  productId: string;
  transactionId: string;
  environment: "production" | "sandbox" | "xcode" | "simulated";
  purchasedAt: Date | null;
  /** play_store: Google still has it unconsumed. */
  needsConsume?: boolean;
  /** What the store said, kept on the purchase row. */
  raw?: Record<string, unknown>;
};

/** A subscription as the store reported it. */
export type VerifiedSubscription = {
  store: CoinPurchaseStore;
  /** Store product id. */
  productId: string;
  /** App Store original transaction id, or Play purchase token: what re-checks use. */
  storeRef: string;
  transactionId: string;
  environment: "production" | "sandbox" | "xcode";
  /** When access ends: in the past for an expired, revoked or superseded subscription. */
  expiresAt: Date | null;
  isTrial: boolean;
  /** The store data's time, so an older answer never overwrites a newer one. */
  eventAt: Date;
};

export type PurchaseRejection =
  | "missing_proof"
  | "purchase_not_found"
  | "purchase_pending"
  | "purchase_refunded"
  | "product_mismatch"
  | "invalid_proof"
  | "purchase_belongs_to_another_account"
  /** The store can't be asked: not configured, a timeout or a 5xx. */
  | "unavailable";

export type VerifyPurchaseInput = {
  store: CoinPurchaseStore;
  productId: string;
  transactionId: string;
  /** app_store: StoreKit 2 jwsRepresentation. play_store: purchaseToken. */
  proof?: string;
  /** The Worn user id the purchase must be tied to. */
  userId: string;
};

export type VerifySubscriptionInput = {
  store: CoinPurchaseStore;
  proof?: string;
  userId: string;
};

export type Rejected = { ok: false; reason: PurchaseRejection; message: string };

export type VerifyPurchaseResult = { ok: true; purchase: VerifiedPurchase } | Rejected;

export type VerifySubscriptionResult = { ok: true; subscription: VerifiedSubscription } | Rejected;

export interface PurchaseVerifier {
  readonly name: string;
  /** Per store: false when every verification would be "unavailable", so the app shouldn't sell. */
  readonly stores: Record<CoinPurchaseStore, boolean>;
  /** A consumable (coin pack) purchase. */
  verify(input: VerifyPurchaseInput): Promise<VerifyPurchaseResult>;
  /** An auto-renewable subscription (Closet premium). */
  verifySubscription(input: VerifySubscriptionInput): Promise<VerifySubscriptionResult>;
}

const STORE_NAMES: Record<CoinPurchaseStore, string> = {
  app_store: "App Store",
  play_store: "Google Play",
};

function unavailable(store: CoinPurchaseStore): Rejected {
  return { ok: false, reason: "unavailable", message: `${STORE_NAMES[store]} purchases are not configured` };
}

/** Sends each purchase to its store's verifier; a store without one is unavailable. */
export function routePurchaseVerifier(
  byStore: Partial<Record<CoinPurchaseStore, PurchaseVerifier>>,
): PurchaseVerifier {
  const names = Object.values(byStore).map((v) => v.name);
  return {
    name: names.length > 0 ? names.join("+") : "none",
    stores: {
      app_store: byStore.app_store?.stores.app_store ?? false,
      play_store: byStore.play_store?.stores.play_store ?? false,
    },
    async verify(input) {
      return byStore[input.store]?.verify(input) ?? unavailable(input.store);
    },
    async verifySubscription(input) {
      return byStore[input.store]?.verifySubscription(input) ?? unavailable(input.store);
    },
  };
}

/** No store configured: every purchase is unavailable. */
export const unconfiguredPurchaseVerifier: PurchaseVerifier = routePurchaseVerifier({});

export const SIMULATED_TRANSACTION_PREFIX = "simulated-";

/** Dev builds only: never when NODE_ENV is production, and only with IAP_ALLOW_SIMULATED=1. */
export function simulatedPurchasesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.IAP_ALLOW_SIMULATED === "1";
}

/**
 * Accepts `simulated-` coin transaction ids for any known product while simulatedPurchasesAllowed();
 * every other purchase goes to `next`. The flag is read on each call.
 */
export function withSimulatedPurchases(
  next: PurchaseVerifier,
  env: NodeJS.ProcessEnv = process.env,
): PurchaseVerifier {
  return {
    name: next.name,
    get stores() {
      const simulated = simulatedPurchasesAllowed(env);
      return {
        app_store: next.stores.app_store || simulated,
        play_store: next.stores.play_store || simulated,
      };
    },
    async verify(input) {
      if (!simulatedPurchasesAllowed(env) || !input.transactionId.startsWith(SIMULATED_TRANSACTION_PREFIX)) {
        return next.verify(input);
      }
      return {
        ok: true,
        purchase: {
          store: input.store,
          productId: input.productId,
          transactionId: input.transactionId,
          environment: "simulated",
          purchasedAt: new Date(),
        },
      };
    },
    verifySubscription: (input) => next.verifySubscription(input),
  };
}

/** The verifier for the configured stores, plus simulated purchases where allowed. */
export function createPurchaseVerifier(
  stores: StoreConnections,
  env: NodeJS.ProcessEnv = process.env,
): PurchaseVerifier {
  return withSimulatedPurchases(
    routePurchaseVerifier({
      ...(stores.apple ? { app_store: createAppleVerifier(stores.apple) } : {}),
      ...(stores.play ? { play_store: createPlayVerifier(stores.play) } : {}),
    }),
    env,
  );
}

export type CreditOutcome =
  | (CreditCoinPurchaseResult & { pack: CoinPack })
  | { status: "unknown_product"; purchase?: undefined };

/**
 * The one grant function. Credits the coins COIN_PACKS defines for the verified product, once per
 * (store, transaction id), in one DB transaction with its ledger entry. `source` says which path
 * (app validate or store notification) got there.
 */
export async function creditCoinPurchase(
  repos: Repositories,
  userId: string,
  purchase: VerifiedPurchase,
  source: "validate" | "notification",
): Promise<CreditOutcome> {
  const pack = coinPackByStoreProductId(purchase.productId);
  if (!pack) return { status: "unknown_product" };
  const result = await repos.creditCoinPurchase({
    userId,
    store: purchase.store,
    transactionId: purchase.transactionId,
    productId: pack.storeProductId,
    coins: pack.coins,
    environment: purchase.environment,
    source,
    rawPayload: {
      purchasedAt: purchase.purchasedAt?.toISOString() ?? null,
      ...(purchase.needsConsume !== undefined ? { needsConsume: purchase.needsConsume } : {}),
      ...(purchase.raw ? { store: purchase.raw } : {}),
    },
  });
  return { ...result, pack };
}

export type ValidateOutcome =
  | {
      ok: true;
      pack: CoinPack;
      purchase: CoinPurchaseRecord;
      balanceAfter: number;
      alreadyGranted: boolean;
      needsConsume?: boolean;
    }
  | { ok: false; status: 400 | 402 | 409 | 503; error: string; message: string; reason?: string };

export const PURCHASES_UNAVAILABLE = {
  ok: false,
  status: 503,
  error: "Unavailable",
  message: "Purchases are unavailable",
} as const;

/** Maps a verifier rejection to the response the contract gives it. */
export function rejectionResponse(rejected: Rejected): Extract<ValidateOutcome, { ok: false }> {
  if (rejected.reason === "unavailable") return { ...PURCHASES_UNAVAILABLE, reason: rejected.message };
  if (rejected.reason === "missing_proof") {
    return { ok: false, status: 400, error: "Bad Request", message: rejected.message };
  }
  const status = rejected.reason === "purchase_belongs_to_another_account" ? 409 : 402;
  return { ok: false, status, error: rejected.reason, message: rejected.message };
}

/** POST /coins/iap/validate: verify with the store, then credit through creditCoinPurchase. */
export async function validateCoinPurchase(
  repos: Repositories,
  verifier: PurchaseVerifier,
  userId: string,
  body: IapValidateBody,
): Promise<ValidateOutcome> {
  if (!coinPackByStoreProductId(body.productId)) {
    return { ok: false, status: 400, error: "Bad Request", message: `Unknown product: ${body.productId}` };
  }

  const verified = await verifier.verify({
    store: body.store,
    productId: body.productId,
    transactionId: body.transactionId,
    proof: body.store === "app_store" ? body.jws : body.purchaseToken,
    userId,
  });
  if (!verified.ok) return rejectionResponse(verified);
  const purchase = verified.purchase;
  if (purchase.store !== body.store || purchase.transactionId !== body.transactionId) {
    return {
      ok: false,
      status: 402,
      error: "purchase_not_found",
      message: "The store reported a different transaction",
    };
  }
  if (purchase.productId !== body.productId) {
    return {
      ok: false,
      status: 402,
      error: "product_mismatch",
      message: "This transaction is for a different product",
    };
  }

  const credited = await creditCoinPurchase(repos, userId, purchase, "validate");
  if (credited.status === "unknown_product") {
    return { ok: false, status: 400, error: "Bad Request", message: `Unknown product: ${purchase.productId}` };
  }
  if (credited.status === "other_user") {
    return {
      ok: false,
      status: 409,
      error: "purchase_belongs_to_another_account",
      message: "This purchase was already added to another Worn account",
    };
  }
  return {
    ok: true,
    pack: credited.pack,
    purchase: credited.purchase,
    balanceAfter: credited.balanceAfter,
    // A refund that arrived before any grant leaves a 0-coin record: nothing was credited.
    alreadyGranted: credited.status === "already_granted" && credited.purchase.coinsGranted > 0,
    needsConsume: purchase.needsConsume,
  };
}
