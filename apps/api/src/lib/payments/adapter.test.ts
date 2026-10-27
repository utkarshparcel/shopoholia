import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetPaymentsForTests,
  confirmPaymentIntent,
  createPaymentIntent,
  stagingUpiSmoke,
  upiExperimentEnabled,
} from "./adapter.js";
import { __resetEntitlementsForTests, snapshotForUser } from "../entitlements.js";
import { isUpiPathActive } from "@worn/shared";

describe("UPI / Razorpay payments adapter", () => {
  const original = {
    EXPERIMENT_UPI_CHECKOUT: process.env.EXPERIMENT_UPI_CHECKOUT,
    FEATURE_UPI: process.env.FEATURE_UPI,
    WORN_REGION: process.env.WORN_REGION,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  };

  beforeEach(() => {
    __resetPaymentsForTests();
    __resetEntitlementsForTests();
    delete process.env.EXPERIMENT_UPI_CHECKOUT;
    delete process.env.FEATURE_UPI;
    delete process.env.RAZORPAY_KEY_ID;
    process.env.WORN_REGION = "IN";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("creates UPI intent with staging deep-link when experiment on", () => {
    process.env.EXPERIMENT_UPI_CHECKOUT = "1";
    expect(upiExperimentEnabled()).toBe(true);
    expect(isUpiPathActive({ region: "IN", upiExperimentEnabled: true })).toBe(true);

    const intent = createPaymentIntent({
      userId: "00000000-0000-4000-8000-000000000010",
      productId: "closet_premium_monthly",
      region: "IN",
      method: "upi",
    });
    expect(intent.upiIntentUrl).toMatch(/^upi:\/\//);
    expect(intent.amountMinor).toBe(19_900);
    expect(intent.currency).toBe("INR");
    expect(intent.publicKeyHint).toBeNull();
  });

  it("confirm grants Closet entitlements", () => {
    process.env.EXPERIMENT_UPI_CHECKOUT = "1";
    const userId = "00000000-0000-4000-8000-000000000011";
    const intent = createPaymentIntent({
      userId,
      productId: "closet_premium_monthly",
      method: "upi",
    });
    const confirmed = confirmPaymentIntent({ intentId: intent.id, userId });
    expect(confirmed.intent.status).toBe("paid");
    expect(confirmed.entitlementsGranted).toContain("accountant");
    expect(snapshotForUser(userId).grants.length).toBeGreaterThan(0);
  });

  it("staging UPI smoke end-to-end", () => {
    const result = stagingUpiSmoke("00000000-0000-4000-8000-000000000012");
    expect(result.ok).toBe(true);
    expect(result.intent.upiIntentUrl).toBeTruthy();
    expect(result.entitlementsGranted).toContain("outfits");
  });
});
