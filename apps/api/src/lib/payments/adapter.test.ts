import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PaymentRequestError,
  PaymentSignatureError,
  confirmPaymentIntent,
  createPaymentIntent,
  isStoreOnlyProduct,
  processRazorpayWebhook,
  upiExperimentEnabled,
} from "./adapter.js";
import { isUpiPathActive } from "@worn/shared";
import { createMemoryRepositories } from "../repositories/memory.js";

describe("UPI / Razorpay payments adapter", () => {
  const keys = [
    "EXPERIMENT_UPI_CHECKOUT",
    "FEATURE_UPI",
    "WORN_REGION",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ] as const;
  const original: Record<string, string | undefined> = {};
  let repos: ReturnType<typeof createMemoryRepositories>;
  const userId = "00000000-0000-4000-8000-000000000011";

  beforeEach(() => {
    for (const k of keys) {
      original[k] = process.env[k];
      delete process.env[k];
    }
    process.env.WORN_REGION = "IN";
    repos = createMemoryRepositories();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("reads the UPI experiment flag", () => {
    process.env.EXPERIMENT_UPI_CHECKOUT = "1";
    expect(upiExperimentEnabled()).toBe(true);
    expect(isUpiPathActive({ region: "IN", upiExperimentEnabled: true })).toBe(true);
  });

  it("never sells Closet premium or coins: those are store billing only", async () => {
    process.env.EXPERIMENT_UPI_CHECKOUT = "1";
    for (const productId of ["closet_premium_monthly", "closet_accountant_monthly", "worn.coins.100", "coins_small"]) {
      expect(isStoreOnlyProduct(productId)).toBe(true);
      await expect(createPaymentIntent(repos, { userId, productId, region: "IN", method: "upi" })).rejects.toThrow(
        PaymentRequestError,
      );
    }
  });

  it("refuses a product with no price", async () => {
    expect(isStoreOnlyProduct("tailoring_alteration")).toBe(false);
    await expect(
      createPaymentIntent(repos, { userId, productId: "tailoring_alteration", region: "IN", method: "upi" }),
    ).rejects.toThrow(/No price/);
  });

  it("a paid intent unlocks nothing digital", async () => {
    const intent = await repos.createPaymentIntent({
      userId,
      provider: "stub",
      productId: "tailoring_alteration",
      amountMinor: 19_900,
      currency: "INR",
      upiIntentUrl: null,
      providerOrderId: null,
    });
    const confirmed = await confirmPaymentIntent(repos, { intentId: intent.id, userId });
    expect(confirmed.intent.status).toBe("paid");
    expect(confirmed.entitlementsGranted).toEqual([]);
    expect(await repos.listEntitlementGrants(userId)).toEqual([]);
  });

  it("refuses to confirm a legacy store intent here", async () => {
    const intent = await repos.createPaymentIntent({
      userId,
      provider: "revenuecat",
      productId: "closet_premium_monthly",
      amountMinor: 19_900,
      currency: "INR",
      upiIntentUrl: null,
      providerOrderId: null,
    });
    await expect(confirmPaymentIntent(repos, { intentId: intent.id, userId })).rejects.toThrow(PaymentRequestError);
  });

  it("Razorpay: checkout signature and signed webhook mark the intent paid, with no grant", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp-secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp-webhook-secret";
    const intent = await repos.createPaymentIntent({
      userId,
      provider: "razorpay_upi",
      productId: "tailoring_alteration",
      amountMinor: 49_900,
      currency: "INR",
      upiIntentUrl: null,
      providerOrderId: "order_1",
    });

    await expect(
      confirmPaymentIntent(repos, {
        intentId: intent.id,
        userId,
        providerPaymentId: "pay_1",
        providerSignature: "00",
      }),
    ).rejects.toThrow(PaymentSignatureError);
    const signature = createHmac("sha256", "rzp-secret").update("order_1|pay_1").digest("hex");
    const confirmed = await confirmPaymentIntent(repos, {
      intentId: intent.id,
      userId,
      providerPaymentId: "pay_1",
      providerSignature: signature,
    });
    expect(confirmed).toMatchObject({ intent: { status: "paid" }, entitlementsGranted: [] });

    const second = await repos.createPaymentIntent({
      userId,
      provider: "razorpay_upi",
      productId: "tailoring_alteration",
      amountMinor: 49_900,
      currency: "INR",
      upiIntentUrl: null,
      providerOrderId: "order_2",
    });
    const body = Buffer.from(
      JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_2", order_id: "order_2", amount: 49_900, currency: "INR" } } },
      }),
    );
    expect(await processRazorpayWebhook(repos, body, "bad")).toMatchObject({ ok: false, reason: "invalid_signature" });
    const webhookSignature = createHmac("sha256", "rzp-webhook-secret").update(body).digest("hex");
    expect(await processRazorpayWebhook(repos, body, webhookSignature)).toEqual({
      ok: true,
      intentId: second.id,
      status: "paid",
    });
    expect(await repos.listEntitlementGrants(userId)).toEqual([]);
  });

  it("Razorpay webhook without a secret is unconfigured", async () => {
    expect(await processRazorpayWebhook(repos, Buffer.from("{}"), "x")).toMatchObject({
      ok: false,
      reason: "unconfigured",
    });
  });
});
