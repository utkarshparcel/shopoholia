import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";
import { __resetSettlementsForTests } from "../lib/take-rate.js";

describe("monetization routes", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  const envKeys = [
    "FEATURE_PREMIUM_GATES",
    "FEATURE_TAKE_RATE",
    "EXPERIMENT_UPI_CHECKOUT",
    "IAP_ALLOW_SIMULATED",
    "APPLE_BUNDLE_ID",
    "ANDROID_PACKAGE_NAME",
    "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  ] as const;
  const originals: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of envKeys) {
      originals[k] = process.env[k];
      delete process.env[k];
    }
    __resetSettlementsForTests();
    // Dev simulation: a trial without a store purchase (never in production).
    process.env.IAP_ALLOW_SIMULATED = "1";
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
    expect(offerings.json().offerings[0].storeProductId).toBe("worn.closet.premium.monthly");
  });

  it("trial sync without a store purchase is refused when dev simulation is off", async () => {
    delete process.env.IAP_ALLOW_SIMULATED;
    const { accessToken } = await login(app);
    const sync = await app.inject({
      method: "POST",
      url: "/entitlements/sync",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { productId: "closet_premium_monthly", startTrial: true },
    });
    expect(sync.statusCode).toBe(400);
  });

  it("has no RevenueCat webhook; App Store notifications need APPLE_BUNDLE_ID", async () => {
    const rc = await app.inject({ method: "POST", url: "/webhooks/revenuecat", payload: { event: {} } });
    expect(rc.statusCode).toBe(404);
    const asn = await app.inject({ method: "POST", url: "/webhooks/app-store", payload: { signedPayload: "a.b.c" } });
    expect(asn.statusCode).toBe(503);
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

  it("refuses UPI payment intents for Closet premium and coins (store billing only)", async () => {
    const { accessToken } = await login(app);
    for (const productId of ["closet_premium_monthly", "worn.coins.100"]) {
      const intent = await app.inject({
        method: "POST",
        url: "/payments/intents",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { productId, region: "IN", method: "upi" },
      });
      expect(intent.statusCode).toBe(400);
      expect(intent.json().message).toMatch(/App Store and Google Play/);
    }
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
