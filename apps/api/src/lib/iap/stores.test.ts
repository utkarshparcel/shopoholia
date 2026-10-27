import { describe, expect, it } from "vitest";
import { appAccountTokenForUser, playAccountIdForUser } from "./accounts.js";
import { createPlayClient, PlayApiError } from "./google-play.js";
import {
  appleSubscription,
  createAppleVerifier,
  createPlayVerifier,
  storeConnectionsFromEnv,
  type PlayStoreConnection,
} from "./stores.js";
import {
  TEST_BUNDLE_ID,
  TEST_PACKAGE_NAME,
  appleTransaction,
  createFakePlay,
  fixturePem,
  signAppleJws,
  signXcodeJws,
  testAppleTrust,
} from "./test-support.js";
import { toAppleTransaction } from "./apple.js";

const USER = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const OTHER_USER = "9b2c1d3e-0000-4000-8000-000000000001";

describe("account binding", () => {
  it("matches the contract's test vectors", () => {
    expect(appAccountTokenForUser("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(USER);
    expect(appAccountTokenForUser("user-42")).toBe("09014ab4-c6b0-5921-8946-33861b9ab243");
    expect(playAccountIdForUser(USER)).toBe("16362f566387b3cf5a6e92fb0a986c76ca20eb3a0c12cbdfbd0b29501e0c18df");
  });
});

describe("App Store verifier", () => {
  const dev = createAppleVerifier({ bundleId: TEST_BUNDLE_ID, production: false, trust: testAppleTrust() });
  const prod = createAppleVerifier({ bundleId: TEST_BUNDLE_ID, production: true, trust: testAppleTrust() });
  const coin = (overrides: Record<string, unknown> = {}) =>
    appleTransaction({ appAccountToken: USER, ...overrides });
  const verify = (verifier: typeof dev, tx: Record<string, unknown>, userId = USER) =>
    verifier.verify({
      store: "app_store",
      productId: String(tx.productId),
      transactionId: String(tx.transactionId),
      proof: signAppleJws(tx),
      userId,
    });

  it("accepts a Sandbox consumable outside production", async () => {
    const tx = coin({ productId: "worn.coins.650" });
    const result = await verify(dev, tx);
    expect(result).toMatchObject({
      ok: true,
      purchase: {
        store: "app_store",
        productId: "worn.coins.650",
        transactionId: tx.transactionId,
        environment: "sandbox",
      },
    });
    expect(dev.stores).toEqual({ app_store: true, play_store: false });
  });

  it("accepts Production in production and refuses Sandbox there", async () => {
    expect((await verify(prod, coin({ environment: "Production" }))).ok).toBe(true);
    expect(await verify(prod, coin())).toMatchObject({ ok: false, reason: "invalid_proof" });
  });

  it("ties the purchase to the account: missing token 402, another account 409", async () => {
    const unbound = appleTransaction();
    expect(await verify(dev, unbound)).toMatchObject({ ok: false, reason: "invalid_proof" });
    expect(await verify(dev, coin(), OTHER_USER)).toMatchObject({
      ok: false,
      reason: "purchase_belongs_to_another_account",
    });
    // StoreKit may send the token uppercased.
    expect((await verify(dev, coin({ appAccountToken: USER.toUpperCase() }))).ok).toBe(true);
  });

  it("refuses another app, unknown products, subscriptions, quantities and refunds", async () => {
    expect(await verify(dev, coin({ bundleId: "com.other.app" }))).toMatchObject({ reason: "invalid_proof" });
    expect(await verify(dev, coin({ productId: "worn.coins.999999" }))).toMatchObject({
      reason: "product_mismatch",
    });
    expect(
      await verify(dev, coin({ productId: "worn.closet.premium.monthly", type: "Auto-Renewable Subscription" })),
    ).toMatchObject({ reason: "product_mismatch" });
    expect(await verify(dev, coin({ type: "Non-Consumable" }))).toMatchObject({ reason: "product_mismatch" });
    expect(await verify(dev, coin({ quantity: 3 }))).toMatchObject({ reason: "product_mismatch" });
    expect(await verify(dev, coin({ revocationDate: Date.now() }))).toMatchObject({ reason: "purchase_refunded" });
  });

  it("needs a JWS and rejects a bad one", async () => {
    expect(
      await dev.verify({ store: "app_store", productId: "worn.coins.100", transactionId: "1", userId: USER }),
    ).toMatchObject({ ok: false, reason: "missing_proof" });
    expect(
      await dev.verify({
        store: "app_store",
        productId: "worn.coins.100",
        transactionId: "1",
        proof: "not-a-jws",
        userId: USER,
      }),
    ).toMatchObject({ ok: false, reason: "invalid_proof" });
  });

  it("accepts Xcode StoreKit Testing only with the Xcode certificate configured", async () => {
    const tx = coin();
    const input = {
      store: "app_store" as const,
      productId: "worn.coins.100",
      transactionId: String(tx.transactionId),
      proof: signXcodeJws(tx),
      userId: USER,
    };
    expect(await dev.verify(input)).toMatchObject({ ok: false, reason: "invalid_proof" });
    const xcode = createAppleVerifier({
      bundleId: TEST_BUNDLE_ID,
      production: false,
      trust: testAppleTrust({ xcode: true }),
    });
    expect(await xcode.verify(input)).toMatchObject({ ok: true, purchase: { environment: "xcode" } });
    const xcodeInProd = createAppleVerifier({
      bundleId: TEST_BUNDLE_ID,
      production: true,
      trust: testAppleTrust({ xcode: true }),
    });
    expect(await xcodeInProd.verify(input)).toMatchObject({ ok: false, reason: "invalid_proof" });
  });

  it("verifies Closet subscriptions with their expiry and trial", async () => {
    const expiresDate = Date.now() + 30 * 86_400_000;
    const tx = coin({
      type: "Auto-Renewable Subscription",
      productId: "worn.closet.premium.monthly",
      originalTransactionId: "1000000000000001",
      expiresDate,
      offerType: 1,
    });
    const result = await dev.verifySubscription({ store: "app_store", proof: signAppleJws(tx), userId: USER });
    expect(result).toMatchObject({
      ok: true,
      subscription: {
        productId: "worn.closet.premium.monthly",
        storeRef: "1000000000000001",
        isTrial: true,
        environment: "sandbox",
      },
    });
    if (result.ok) expect(result.subscription.expiresAt?.getTime()).toBe(expiresDate);
    expect(
      await dev.verifySubscription({ store: "app_store", proof: signAppleJws(coin()), userId: USER }),
    ).toMatchObject({ ok: false, reason: "product_mismatch" });
  });

  it("appleSubscription: revocation, upgrade and billing grace period", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    const base = toAppleTransaction(
      appleTransaction({
        type: "Auto-Renewable Subscription",
        productId: "worn.closet.premium.monthly",
        expiresDate: now.getTime() + 1000,
        signedDate: now.getTime() - 5000,
      }),
    );
    expect(appleSubscription(base, "sandbox", now.getTime() + 9000, now).expiresAt?.getTime()).toBe(
      now.getTime() + 9000,
    );
    expect(appleSubscription({ ...base, isUpgraded: true }, "sandbox", null, now).expiresAt).toEqual(now);
    expect(
      appleSubscription({ ...base, revocationDate: now.getTime() - 100 }, "sandbox", null, now).expiresAt?.getTime(),
    ).toBe(now.getTime() - 100);
    expect(appleSubscription(base, "sandbox", null, now).eventAt.getTime()).toBe(now.getTime() - 5000);
    expect(appleSubscription(base, "sandbox", null, now).isTrial).toBe(false);
  });
});

describe("Google Play verifier", () => {
  function setup(production = false) {
    const fake = createFakePlay();
    const client = createPlayClient({
      serviceAccount: fake.serviceAccount,
      allowEndpointOverrides: true,
      apiBaseUrl: fake.apiBaseUrl,
      fetchImpl: fake.fetch,
    });
    const play: PlayStoreConnection = { packageName: TEST_PACKAGE_NAME, production, client };
    return { fake, verifier: createPlayVerifier(play) };
  }
  const bought = (overrides: Record<string, unknown> = {}) => ({
    purchaseState: 0,
    consumptionState: 0,
    acknowledgementState: 0,
    orderId: "GPA.3300-0000-0000-00001",
    productId: "worn.coins.350",
    purchaseTimeMillis: String(Date.now()),
    obfuscatedExternalAccountId: playAccountIdForUser(USER),
    ...overrides,
  });
  const input = (token: string, userId = USER) => ({
    store: "play_store" as const,
    productId: "worn.coins.350",
    transactionId: "GPA.3300-0000-0000-00001",
    proof: token,
    userId,
  });

  it("accepts a purchased, unconsumed coin pack, keyed on the order id", async () => {
    const { fake, verifier } = setup();
    fake.products.set("tok-1", bought());
    expect(await verifier.verify(input("tok-1"))).toMatchObject({
      ok: true,
      purchase: {
        store: "play_store",
        productId: "worn.coins.350",
        transactionId: "GPA.3300-0000-0000-00001",
        environment: "production",
        needsConsume: true,
      },
    });
    fake.products.set("tok-2", bought({ orderId: undefined, consumptionState: 1 }));
    expect(await verifier.verify(input("tok-2"))).toMatchObject({
      ok: true,
      purchase: { transactionId: "tok-2", needsConsume: false },
    });
  });

  it("maps pending, canceled, unbound and other-account purchases", async () => {
    const { fake, verifier } = setup();
    fake.products.set("pending", bought({ purchaseState: 2 }));
    fake.products.set("canceled", bought({ purchaseState: 1 }));
    fake.products.set("unbound", bought({ obfuscatedExternalAccountId: undefined }));
    expect(await verifier.verify(input("pending"))).toMatchObject({ reason: "purchase_pending" });
    expect(await verifier.verify(input("canceled"))).toMatchObject({ reason: "purchase_refunded" });
    expect(await verifier.verify(input("unbound"))).toMatchObject({ reason: "invalid_proof" });
    fake.products.set("mine", bought());
    expect(await verifier.verify(input("mine", OTHER_USER))).toMatchObject({
      reason: "purchase_belongs_to_another_account",
    });
  });

  it("accepts license-tester purchases outside production only", async () => {
    const dev = setup(false);
    dev.fake.products.set("test", bought({ purchaseType: 0 }));
    expect(await dev.verifier.verify(input("test"))).toMatchObject({ ok: true, purchase: { environment: "sandbox" } });
    const prod = setup(true);
    prod.fake.products.set("test", bought({ purchaseType: 0 }));
    expect(await prod.verifier.verify(input("test"))).toMatchObject({ ok: false, reason: "invalid_proof" });
  });

  it("unknown token is not found (402); a Google outage is unavailable (503)", async () => {
    const { fake, verifier } = setup();
    expect(await verifier.verify(input("nope"))).toMatchObject({ reason: "purchase_not_found" });
    fake.products.set("tok", bought());
    fake.failWith = 503;
    expect(await verifier.verify(input("tok"))).toMatchObject({ reason: "unavailable" });
    expect(await verifier.verify({ ...input("tok"), proof: undefined })).toMatchObject({ reason: "missing_proof" });
  });

  it("checks subscriptions with subscriptionsv2", async () => {
    const { fake, verifier } = setup();
    const expiryTime = new Date(Date.now() + 86_400_000).toISOString();
    const sub = (state: string, extra: Record<string, unknown> = {}) => ({
      subscriptionState: state,
      latestOrderId: "GPA.1",
      externalAccountIdentifiers: { obfuscatedExternalAccountId: playAccountIdForUser(USER) },
      lineItems: [{ productId: "worn.closet.outfits.monthly", expiryTime, offerPhase: { freeTrial: {} } }],
      ...extra,
    });
    fake.subscriptions.set("active", sub("SUBSCRIPTION_STATE_ACTIVE"));
    fake.subscriptions.set("canceled", sub("SUBSCRIPTION_STATE_CANCELED"));
    fake.subscriptions.set("expired", sub("SUBSCRIPTION_STATE_EXPIRED"));
    fake.subscriptions.set("pending", sub("SUBSCRIPTION_STATE_PENDING"));
    fake.subscriptions.set("other", sub("SUBSCRIPTION_STATE_ACTIVE", { lineItems: [{ productId: "other.sku" }] }));
    const check = (token: string) => verifier.verifySubscription({ store: "play_store", proof: token, userId: USER });

    const active = await check("active");
    expect(active).toMatchObject({
      ok: true,
      subscription: { productId: "worn.closet.outfits.monthly", storeRef: "active", isTrial: true },
    });
    if (active.ok) expect(active.subscription.expiresAt?.toISOString()).toBe(expiryTime);
    const canceled = await check("canceled");
    if (canceled.ok) expect(canceled.subscription.expiresAt?.toISOString()).toBe(expiryTime);
    const expired = await check("expired");
    expect(expired.ok && expired.subscription.expiresAt!.getTime() <= Date.now()).toBe(true);
    expect(await check("pending")).toMatchObject({ ok: false, reason: "purchase_pending" });
    expect(await check("other")).toMatchObject({ ok: false, reason: "product_mismatch" });
    expect(await check("missing")).toMatchObject({ ok: false, reason: "purchase_not_found" });
  });
});

describe("Google Play client", () => {
  it("signs a service-account JWT once and reuses the access token", async () => {
    const fake = createFakePlay();
    fake.products.set("a", { purchaseState: 0, productId: "worn.coins.100" });
    const client = createPlayClient({
      serviceAccount: fake.serviceAccount,
      allowEndpointOverrides: true,
      apiBaseUrl: fake.apiBaseUrl,
      fetchImpl: fake.fetch,
    });
    await Promise.all([
      client.getProductPurchase(TEST_PACKAGE_NAME, "worn.coins.100", "a"),
      client.getProductPurchase(TEST_PACKAGE_NAME, "worn.coins.100", "a"),
    ]);
    await client.getProductPurchase(TEST_PACKAGE_NAME, "worn.coins.100", "a");
    expect(fake.tokenRequests).toBe(1);
    expect(fake.apiRequests[0]).toBe(
      `/androidpublisher/v3/applications/${TEST_PACKAGE_NAME}/purchases/products/worn.coins.100/tokens/a`,
    );
  });

  it("renews the token after it expires", async () => {
    const fake = createFakePlay();
    fake.products.set("a", { purchaseState: 0 });
    let clock = 1_000_000;
    const client = createPlayClient({
      serviceAccount: fake.serviceAccount,
      allowEndpointOverrides: true,
      apiBaseUrl: fake.apiBaseUrl,
      fetchImpl: fake.fetch,
      now: () => clock,
    });
    await client.getProductPurchase(TEST_PACKAGE_NAME, "worn.coins.100", "a");
    clock += 3_600_000;
    await client.getProductPurchase(TEST_PACKAGE_NAME, "worn.coins.100", "a");
    expect(fake.tokenRequests).toBe(2);
  });

  it("pages through voided purchases", async () => {
    const fake = createFakePlay();
    fake.voided.push(
      { orderId: "GPA.1", purchaseToken: "t1", voidedTimeMillis: "2000" },
      { orderId: "GPA.2", purchaseToken: "t2", voidedTimeMillis: "3000" },
    );
    const client = createPlayClient({
      serviceAccount: fake.serviceAccount,
      allowEndpointOverrides: true,
      apiBaseUrl: fake.apiBaseUrl,
      fetchImpl: fake.fetch,
    });
    const first = await client.listVoidedPurchases(TEST_PACKAGE_NAME, { startTimeMs: 1000 });
    expect(first.voidedPurchases.map((v) => v.orderId)).toEqual(["GPA.1"]);
    const second = await client.listVoidedPurchases(TEST_PACKAGE_NAME, {
      startTimeMs: 1000,
      pageToken: first.nextPageToken!,
    });
    expect(second).toEqual({ voidedPurchases: [expect.objectContaining({ orderId: "GPA.2" })], nextPageToken: null });
  });

  it("ignores endpoint overrides in production and reports network failures", async () => {
    const urls: string[] = [];
    const fake = createFakePlay();
    const client = createPlayClient({
      serviceAccount: fake.serviceAccount,
      allowEndpointOverrides: false,
      apiBaseUrl: fake.apiBaseUrl,
      fetchImpl: async (url) => {
        urls.push(String(url));
        throw new TypeError("fetch failed");
      },
    });
    const error = await client.getSubscription(TEST_PACKAGE_NAME, "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlayApiError);
    expect((error as PlayApiError).status).toBeNull();
    expect(urls).toEqual(["https://oauth2.googleapis.com/token"]);
  });
});

describe("storeConnectionsFromEnv", () => {
  it("leaves a store without settings unconfigured", () => {
    expect(storeConnectionsFromEnv({ NODE_ENV: "test" })).toEqual({ apple: null, play: null });
    expect(
      storeConnectionsFromEnv({
        NODE_ENV: "test",
        ANDROID_PACKAGE_NAME: TEST_PACKAGE_NAME,
        GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{not json",
      }).play,
    ).toBeNull();
  });

  it("configures Apple with Apple's root, and the Xcode cert only outside production", () => {
    const xcodePem = fixturePem("xcode.pem").replaceAll("\n", "\\n");
    const dev = storeConnectionsFromEnv({
      NODE_ENV: "development",
      APPLE_BUNDLE_ID: TEST_BUNDLE_ID,
      IAP_ALLOW_XCODE: "1",
      IAP_XCODE_CERT_PEM: xcodePem,
    });
    expect(dev.apple?.bundleId).toBe(TEST_BUNDLE_ID);
    expect(dev.apple?.trust.roots[0]?.subject).toContain("Apple Root CA - G3");
    expect(dev.apple?.trust.xcodeCert).not.toBeNull();
    const prod = storeConnectionsFromEnv({
      NODE_ENV: "production",
      APPLE_BUNDLE_ID: TEST_BUNDLE_ID,
      IAP_ALLOW_XCODE: "1",
      IAP_XCODE_CERT_PEM: xcodePem,
    });
    expect(prod.apple?.production).toBe(true);
    expect(prod.apple?.trust.xcodeCert).toBeNull();
  });

  it("configures Google Play from the service-account JSON", () => {
    const fake = createFakePlay();
    const { play } = storeConnectionsFromEnv({
      NODE_ENV: "test",
      ANDROID_PACKAGE_NAME: TEST_PACKAGE_NAME,
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: fake.serviceAccountJson,
    });
    expect(play).toMatchObject({ packageName: TEST_PACKAGE_NAME, production: false });
  });
});
