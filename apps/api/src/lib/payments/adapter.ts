/**
 * MON-UPI-REGIONAL — payments adapter. Intents are stored (payment_intents). With
 * RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET an intent is a Razorpay order, and it becomes
 * "paid" only after Razorpay's checkout signature or a signed webhook checks out.
 * Without keys, outside production only, a stub intent stands in (dev simulation).
 *
 * Razorpay is for real-world services only. Closet premium and coins are digital goods, sold only
 * through App Store / Google Play billing (store policy), so they never get an intent here and a
 * paid intent unlocks nothing digital.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  COIN_PACKS,
  entitlementsForProduct,
  isUpiPathActive,
  priceForProduct,
  selectPaymentMethod,
  type PaymentIntent,
  type RegionCode,
} from "@worn/shared";
import type { PaymentIntentRecord, Repositories } from "../repositories/types.js";

const RAZORPAY_API = "https://api.razorpay.com/v1";
const RAZORPAY_TIMEOUT_MS = 10_000;

/** Closet premium or coins: digital goods that only App Store / Google Play billing may sell. */
export function isStoreOnlyProduct(productId: string): boolean {
  return (
    entitlementsForProduct(productId).length > 0 ||
    COIN_PACKS.some((pack) => pack.id === productId || pack.storeProductId === productId)
  );
}

export class PaymentIntentNotFoundError extends Error {}
export class PaymentSignatureError extends Error {}
/** Bad input from the client, such as an unknown product or confirming a store purchase here. */
export class PaymentRequestError extends Error {}
/** The payment provider isn't configured or can't be reached. */
export class PaymentsUnavailableError extends Error {}

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
    revenueCatEnabled: false,
  });
  return method === "upi" ? "razorpay_upi" : "stub";
}

function razorpayKeys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function sameHex(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function toPaymentIntent(record: PaymentIntentRecord): PaymentIntent {
  const keyId = process.env.RAZORPAY_KEY_ID;
  return {
    id: record.id,
    provider: record.provider,
    productId: record.productId,
    amountMinor: record.amountMinor,
    currency: record.currency,
    upiIntentUrl: record.upiIntentUrl,
    status: record.status,
    publicKeyHint: keyId ? `${keyId.slice(0, 8)}…` : null,
    providerOrderId: record.providerOrderId,
  };
}

async function createRazorpayOrder(
  keys: { keyId: string; keySecret: string },
  input: { receipt: string; amountMinor: number; currency: string; notes: Record<string, string> },
  fetchImpl: typeof fetch,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(`${RAZORPAY_API}/orders`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      }),
      signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PaymentsUnavailableError("Razorpay request failed", { cause: error });
  }
  if (!res.ok) throw new PaymentsUnavailableError(`Razorpay responded ${res.status}`);
  const order = (await res.json()) as { id?: unknown };
  if (typeof order.id !== "string") throw new PaymentsUnavailableError("Razorpay order had no id");
  return order.id;
}

/**
 * Creates and stores a payment intent. UPI with Razorpay keys creates a Razorpay order
 * (`providerOrderId`) for the client's checkout. Without keys, a stub intent with a staging
 * UPI link is made outside production; in production that's PaymentsUnavailableError.
 */
export async function createPaymentIntent(
  repos: Repositories,
  input: {
    userId: string;
    productId: string;
    region?: RegionCode;
    method?: "upi" | "card" | "iap";
  },
  fetchImpl: typeof fetch = fetch,
): Promise<PaymentIntent> {
  if (isStoreOnlyProduct(input.productId)) {
    throw new PaymentRequestError(
      "Closet premium and coins are sold only through the App Store and Google Play",
    );
  }
  const region = input.region ?? resolveRegion();
  const price = priceForProduct(input.productId, region);
  if (!price) {
    throw new PaymentRequestError(`No price for product ${input.productId} in ${region}`);
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
      revenueCatEnabled: false,
    });

  const useUpi = method === "upi" || (method !== "iap" && upiOn);
  if (method === "iap") {
    throw new PaymentRequestError("App Store and Google Play purchases don't use payment intents");
  }
  const keys = razorpayKeys();
  const provider: PaymentIntentRecord["provider"] = useUpi && keys ? "razorpay_upi" : "stub";
  if (provider === "stub" && process.env.NODE_ENV === "production") {
    throw new PaymentsUnavailableError(
      useUpi
        ? "UPI payments are not available (Razorpay is not configured)"
        : "Payments are not available",
    );
  }

  const id = randomUUID();
  let providerOrderId: string | null = null;
  if (provider === "razorpay_upi") {
    providerOrderId = await createRazorpayOrder(
      keys!,
      {
        receipt: id,
        amountMinor: price.amountMinor,
        currency: price.currency,
        notes: { userId: input.userId, productId: input.productId },
      },
      fetchImpl,
    );
  }
  const upiIntentUrl =
    provider === "stub" && useUpi
      ? `upi://pay?pa=worn@staging&pn=WORN&am=${(price.amountMinor / 100).toFixed(2)}&cu=${price.currency}&tn=${encodeURIComponent(input.productId)}`
      : null;

  const record = await repos.createPaymentIntent({
    id,
    userId: input.userId,
    provider,
    productId: input.productId,
    amountMinor: price.amountMinor,
    currency: price.currency,
    upiIntentUrl,
    providerOrderId,
  });
  return toPaymentIntent(record);
}

/**
 * Client-side confirmation. A Razorpay intent becomes paid only with a valid checkout
 * signature (HMAC-SHA256 of `order_id|payment_id` with the key secret); without one it is
 * marked pending and the webhook settles it. A stub intent (dev only) is paid at once.
 */
export async function confirmPaymentIntent(
  repos: Repositories,
  input: {
    intentId: string;
    userId: string;
    providerPaymentId?: string;
    providerOrderId?: string;
    providerSignature?: string;
  },
): Promise<{ intent: PaymentIntent; entitlementsGranted: string[] }> {
  let intent = await repos.findPaymentIntent(input.intentId);
  if (!intent || intent.userId !== input.userId) {
    throw new PaymentIntentNotFoundError("Payment intent not found");
  }

  if (intent.status !== "paid") {
    if (intent.provider === "revenuecat") {
      // Intents from before store billing moved to /entitlements/sync and /coins/iap/validate.
      throw new PaymentRequestError(
        "App Store and Google Play purchases are confirmed through /entitlements/sync",
      );
    }
    if (intent.provider === "stub") {
      if (process.env.NODE_ENV === "production") {
        throw new PaymentsUnavailableError("Payments are not available");
      }
      intent = await repos.markPaymentIntentPaid(
        intent.id,
        input.providerPaymentId ?? `sim_${intent.id}`,
        new Date(),
      );
    } else if (input.providerSignature && input.providerPaymentId) {
      const keys = razorpayKeys();
      if (!keys) throw new PaymentsUnavailableError("Razorpay is not configured");
      if (input.providerOrderId && input.providerOrderId !== intent.providerOrderId) {
        throw new PaymentSignatureError("Order id does not match this payment intent");
      }
      const expected = hmacHex(keys.keySecret, `${intent.providerOrderId}|${input.providerPaymentId}`);
      if (!sameHex(input.providerSignature, expected)) {
        throw new PaymentSignatureError("Invalid payment signature");
      }
      intent = await repos.markPaymentIntentPaid(intent.id, input.providerPaymentId, new Date());
    } else {
      intent = await repos.markPaymentIntentPending(intent.id);
    }
  }

  if (!intent) throw new PaymentIntentNotFoundError("Payment intent not found");
  // A payment never unlocks a digital entitlement (store policy); the field stays for older clients.
  return { intent: toPaymentIntent(intent), entitlementsGranted: [] };
}

export async function getPaymentIntent(
  repos: Repositories,
  id: string,
  userId: string,
): Promise<PaymentIntent | null> {
  const intent = await repos.findPaymentIntent(id);
  return intent && intent.userId === userId ? toPaymentIntent(intent) : null;
}

export type RazorpayWebhookResult =
  | { ok: true; ignored?: string; intentId?: string; status?: PaymentIntentRecord["status"] }
  | { ok: false; reason: "unconfigured" | "invalid_signature" | "invalid_payload"; message: string };

type RazorpayPaymentEntity = {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
};

/**
 * Razorpay webhook: `X-Razorpay-Signature` is the hex HMAC-SHA256 of the raw body with
 * RAZORPAY_WEBHOOK_SECRET. payment.captured / order.paid mark the matching intent paid
 * (amount and currency must match); payment.failed marks it failed unless paid.
 */
export async function processRazorpayWebhook(
  repos: Repositories,
  rawBody: Buffer,
  signature: string | undefined,
): Promise<RazorpayWebhookResult> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Razorpay webhooks are not configured (set RAZORPAY_WEBHOOK_SECRET)",
    };
  }
  if (!signature || !sameHex(signature, hmacHex(secret, rawBody))) {
    return { ok: false, reason: "invalid_signature", message: "Invalid Razorpay webhook signature" };
  }

  let body: { event?: unknown; payload?: { payment?: { entity?: RazorpayPaymentEntity } } };
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_payload", message: "Body is not JSON" };
  }
  const event = typeof body.event === "string" ? body.event : null;
  if (event !== "payment.captured" && event !== "order.paid" && event !== "payment.failed") {
    return { ok: true, ignored: `unsupported_event:${event ?? "none"}` };
  }
  const payment = body.payload?.payment?.entity;
  if (typeof payment?.id !== "string" || typeof payment.order_id !== "string") {
    return { ok: false, reason: "invalid_payload", message: "Missing payment id or order id" };
  }

  const intent = await repos.findPaymentIntentByProviderOrderId(payment.order_id);
  if (!intent) return { ok: true, ignored: "unknown_order" };

  if (event === "payment.failed") {
    const failed = await repos.markPaymentIntentFailed(intent.id);
    return { ok: true, intentId: intent.id, status: failed?.status };
  }
  if (payment.amount !== intent.amountMinor || payment.currency !== intent.currency) {
    return { ok: true, ignored: "amount_mismatch", intentId: intent.id };
  }
  const paid = await repos.markPaymentIntentPaid(intent.id, payment.id, new Date());
  return { ok: true, intentId: intent.id, status: paid?.status };
}
