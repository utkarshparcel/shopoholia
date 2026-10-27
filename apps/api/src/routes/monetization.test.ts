import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";
import { __resetEntitlementsForTests } from "../lib/entitlements.js";
import { __resetSettlementsForTests } from "../lib/take-rate.js";
import { __resetPaymentsForTests } from "../lib/payments/adapter.js";

describe("monetization routes", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  const envKeys = [
    "FEATURE_REVENUECAT",
    "FEATURE_PREMIUM_GATES",
    "FEATURE_TAKE_RATE",
    "EXPERIMENT_UPI_CHECKOUT",
    "REVENUECAT_WEBHOOK_SECRET",
  ] as const;
  const originals: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of envKeys) {
      originals[k] = process.env[k];
      delete process.env[k];
    }
    __resetEntitlementsForTests();
    __resetSettlementsForTests();
    __resetPaymentsForTests();
    process.env.FEATURE_REVENUECAT = "1";
    process.env.FEATURE_TAKE_RATE = "1";
    process.env.EXPERIMENT_UPI_CHECKOUT = "1";
    const s = await buildTestServer();
    app = s.app;
  });

  afterEach(async () => {
    await app.close();
    for (const k of envKeys) {
      const v = originals[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("syncs trial entitlements and returns offerings", async () => {
    const { accessToken } = await login(app);
    const sync = await app.inject({
      method: "POST",
      url: "/entitlements/sync",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { productId: "closet_premium_monthly", startTrial: true },
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json().snapshot.grants.length).toBe(2);

    const offerings = await app.inject({
      method: "GET",
      url: "/entitlements/offerings?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(offerings.statusCode).toBe(200);
    expect(offerings.json().offerings[0].priceLabel).toMatch(/₹/);
  });

  it("accepts RevenueCat webhook", async () => {
    const { userId } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      payload: {
        event: {
          id: "rc-route-1",
          type: "INITIAL_PURCHASE",
          app_user_id: userId,
          product_id: "closet_accountant_monthly",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  it("settles marketplace order and exports CSV", async () => {
    const { accessToken } = await login(app);
    const settle = await app.inject({
      method: "POST",
      url: "/marketplace/settlements",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        kind: "resale",
        orderRef: "disp-route-1",
        sellerId: "seller-route",
        orderAmountMinor: 100_000,
      },
    });
    expect(settle.statusCode).toBe(200);
    expect(settle.json().sellerPayoutMinor).toBe(90_000);

    const csv = await app.inject({
      method: "GET",
      url: "/marketplace/settlements/export.csv",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain("platform_fee_minor");
  });

  it("UPI payment intent + confirm staging path", async () => {
    const { accessToken } = await login(app);
    const intent = await app.inject({
      method: "POST",
      url: "/payments/intents",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { productId: "closet_premium_monthly", region: "IN", method: "upi" },
    });
    expect(intent.statusCode).toBe(200);
    expect(intent.json().upiIntentUrl).toMatch(/^upi:\/\//);

    const confirm = await app.inject({
      method: "POST",
      url: "/payments/confirm",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { intentId: intent.json().id },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().intent.status).toBe("paid");
  });

  it("gates accountant when FEATURE_PREMIUM_GATES=1 until trial", async () => {
    process.env.FEATURE_PREMIUM_GATES = "1";
    const { accessToken } = await login(app);
    // FINANCIAL consent for accountant
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        userId: "00000000-0000-0000-0000-000000000000",
        scope: "FINANCIAL",
        source: "test",
      },
    });

    const denied = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().message).toMatch(/accountant/i);

    await app.inject({
      method: "POST",
      url: "/entitlements/sync",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { productId: "closet_premium_monthly", startTrial: true },
    });

    const ok = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(ok.statusCode).toBe(200);
  });
});
