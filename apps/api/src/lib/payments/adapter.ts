/**
 * MON-UPI-REGIONAL — payments adapter (Razorpay/UPI stub, no live keys).
 */

import { randomUUID } from "node:crypto";
import {
  isUpiPathActive,
  priceForProduct,
  selectPaymentMethod,
  type PaymentIntent,
  type RegionCode,
} from "@worn/shared";
import { grantTrial, revenueCatEnabled } from "../entitlements.js";

const intents = new Map<string, PaymentIntent & { userId: string }>();

export function upiExperimentEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.EXPERIMENT_UPI_CHECKOUT === "1" || env.FEATURE_UPI === "1";
}

export function resolveRegion(
  env: NodeJS.ProcessEnv = process.env,
): RegionCode {
  const raw = (env.WORN_REGION ?? env.EXPO_PUBLIC_WORN_REGION ?? "IN").toUpperCase();
  if (raw === "US") return "US";
  if (raw === "GLOBAL") return "GLOBAL";
  return "IN";
}

export function paymentsProviderHint(
  env: NodeJS.ProcessEnv = process.env,
): PaymentIntent["provider"] {
  const region = resolveRegion(env);
  const method = selectPaymentMethod({
    region,
    upiExperimentEnabled: upiExperimentEnabled(env),
    revenueCatEnabled: revenueCatEnabled(env),
  });
  if (method === "upi") return "razorpay_upi";
  if (method === "iap") return "revenuecat";
  return "stub";
}

/**
 * Create a payment intent. When Razorpay key is unset, uses stub UPI deep-link
 * (`upi://pay?...`) suitable for staging smoke — never calls Razorpay API.
 */
export function createPaymentIntent(input: {
  userId: string;
  productId: string;
  region?: RegionCode;
  method?: "upi" | "card" | "iap";
}): PaymentIntent {
  const region = input.region ?? resolveRegion();
  const price = priceForProduct(input.productId, region);
  if (!price) {
    throw new Error(`No price for product ${input.productId} in ${region}`);
  }

  const upiOn = isUpiPathActive({
    region,
    upiExperimentEnabled: upiExperimentEnabled(),
  });
  const method =
    input.method ??
    selectPaymentMethod({
      region,
      upiExperimentEnabled: upiExperimentEnabled(),
      revenueCatEnabled: revenueCatEnabled(),
    });

  const useUpi = method === "upi" || (method !== "iap" && upiOn);
  const provider: PaymentIntent["provider"] = useUpi
    ? process.env.RAZORPAY_KEY_ID
      ? "razorpay_upi"
      : "stub"
    : revenueCatEnabled()
      ? "revenuecat"
      : "stub";

  const id = randomUUID();
  const upiIntentUrl = useUpi
    ? `upi://pay?pa=worn@staging&pn=WORN&am=${(price.amountMinor / 100).toFixed(2)}&cu=${price.currency}&tn=${encodeURIComponent(input.productId)}`
    : null;

  const intent: PaymentIntent & { userId: string } = {
    id,
    userId: input.userId,
    provider,
    productId: input.productId,
    amountMinor: price.amountMinor,
    currency: price.currency,
    upiIntentUrl,
    status: "created",
    publicKeyHint: process.env.RAZORPAY_KEY_ID
      ? `${process.env.RAZORPAY_KEY_ID.slice(0, 8)}…`
      : null,
  };
  intents.set(id, intent);
  return intent;
}

export function confirmPaymentIntent(input: {
  intentId: string;
  userId: string;
  providerPaymentId?: string;
}): { intent: PaymentIntent; entitlementsGranted: string[] } {
  const intent = intents.get(input.intentId);
  if (!intent || intent.userId !== input.userId) {
    throw new Error("intent_not_found");
  }
  if (intent.status === "paid") {
    return { intent, entitlementsGranted: [] };
  }

  // Staging smoke: accept confirmation without hitting Razorpay.
  intent.status = "paid";
  intents.set(intent.id, intent);

  const snap = grantTrial(input.userId, intent.productId, "upi");
  return {
    intent,
    entitlementsGranted: snap.grants.map((g) => g.entitlementId),
  };
}

export function getPaymentIntent(id: string): (PaymentIntent & { userId: string }) | null {
  return intents.get(id) ?? null;
}

/** Staging smoke: create + confirm UPI path end-to-end in-process. */
export function stagingUpiSmoke(userId: string, productId = "closet_premium_monthly"): {
  ok: boolean;
  intent: PaymentIntent;
  entitlementsGranted: string[];
} {
  const prev = process.env.EXPERIMENT_UPI_CHECKOUT;
  process.env.EXPERIMENT_UPI_CHECKOUT = "1";
  try {
    const intent = createPaymentIntent({
      userId,
      productId,
      region: "IN",
      method: "upi",
    });
    const confirmed = confirmPaymentIntent({ intentId: intent.id, userId });
    return {
      ok: confirmed.intent.status === "paid" && Boolean(confirmed.intent.upiIntentUrl),
      intent: confirmed.intent,
      entitlementsGranted: confirmed.entitlementsGranted,
    };
  } finally {
    if (prev === undefined) delete process.env.EXPERIMENT_UPI_CHECKOUT;
    else process.env.EXPERIMENT_UPI_CHECKOUT = prev;
  }
}

export function __resetPaymentsForTests(): void {
  intents.clear();
}
