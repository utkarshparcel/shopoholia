import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { createPlayClient } from "../lib/iap/google-play.js";
import { playAccountIdForUser } from "../lib/iap/accounts.js";
import type { StoreConnections } from "../lib/iap/stores.js";
import {
  TEST_BUNDLE_ID,
  TEST_PACKAGE_NAME,
  appStoreNotification,
  appleTransaction,
  createFakePlay,
  signAppleJws,
  testAppleTrust,
  type FakePlay,
} from "../lib/iap/test-support.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { login } from "../test-utils.js";

type App = Awaited<ReturnType<typeof buildServer>>;

function connections(fake: FakePlay | null, opts: { apple?: boolean } = {}): StoreConnections {
  return {
    apple:
      opts.apple === false
        ? null
        : { bundleId: TEST_BUNDLE_ID, production: false, trust: testAppleTrust() },
    play: fake
      ? {
          packageName: TEST_PACKAGE_NAME,
          production: false,
          client: createPlayClient({
            serviceAccount: fake.serviceAccount,
            allowEndpointOverrides: true,
            apiBaseUrl: fake.apiBaseUrl,
            fetchImpl: fake.fetch,
          }),
        }
      : null,
  };
}

const ENV_KEYS = ["IAP_ALLOW_SIMULATED", "NODE_ENV"] as const;

/** New accounts start with a sign-up bonus; tests count from zero. */
async function zeroBalance(repos: ReturnType<typeof createMemoryRepositories>, userId: string) {
  const start = await repos.getCoinBalance(userId);
  if (start > 0) await repos.spendCoins({ userId, delta: start, type: "SPEND_UNLOCK", refType: "test", refId: "reset" });
}

describe("coin purchases (store verified)", () => {
  let app: App;
  let repos: ReturnType<typeof createMemoryRepositories>;
  let fake: FakePlay;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    delete process.env.IAP_ALLOW_SIMULATED;
    repos = createMemoryRepositories();
    fake = createFakePlay();
    app = await buildServer({ logger: false, deps: { repos, storeConnections: connections(fake) } });
  });

  afterEach(async () => {
    await app.close();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  async function user(phone = "919876543210") {
    const { accessToken, userId } = await login(app, phone);
    await zeroBalance(repos, userId);
    return { userId, headers: { authorization: `Bearer ${accessToken}` } };
  }

  function validateApple(headers: Record<string, string>, tx: Record<string, unknown>, jws = signAppleJws(tx)) {
    return app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { store: "app_store", productId: tx.productId, transactionId: tx.transactionId, jws },
    });
  }

  function notify(body: Parameters<typeof appStoreNotification>[0]) {
    return app.inject({
      method: "POST",
      url: "/webhooks/app-store",
      payload: { signedPayload: appStoreNotification(body) },
    });
  }

  async function balance(headers: Record<string, string>) {
    return (await app.inject({ method: "GET", url: "/coins/balance", headers })).json().balance as number;
  }

  it("lists the packs with store product ids and per-store availability", async () => {
    const res = await app.inject({ method: "GET", url: "/coins/packs" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.packs.map((p: { storeProductId: string; coins: number }) => [p.storeProductId, p.coins])).toEqual([
      ["worn.coins.100", 100],
      ["worn.coins.350", 350],
      ["worn.coins.650", 650],
      ["worn.coins.1500", 1500],
    ]);
    expect(body.stores).toEqual({ app_store: true, play_store: true });
    expect(body.purchasesAvailable).toBe(true);
  });

  it("App Store: credits the pack's coins once; a repeat returns the original grant", async () => {
    const { userId, headers } = await user();
    const tx = appleTransaction({ productId: "worn.coins.350", appAccountToken: userId });
    const first = await validateApple(headers, tx);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      success: true,
      coinsGranted: 350,
      balanceAfter: 350,
      packId: expect.any(String),
      transactionId: tx.transactionId,
      alreadyGranted: false,
      refunded: false,
    });
    const again = await validateApple(headers, tx);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ coinsGranted: 350, balanceAfter: 350, alreadyGranted: true });
    expect(await balance(headers)).toBe(350);
  });

  it("credits once when the same purchase is validated in parallel", async () => {
    const { userId, headers } = await user();
    const tx = appleTransaction({ productId: "worn.coins.1500", appAccountToken: userId });
    const jws = signAppleJws(tx);
    const results = await Promise.all(Array.from({ length: 6 }, () => validateApple(headers, tx, jws)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(results.filter((r) => r.json().alreadyGranted === false)).toHaveLength(1);
    expect(await balance(headers)).toBe(1500);
  });

  it("never trusts the client: unknown product 400, mismatched product or transaction 402", async () => {
    const { userId, headers } = await user();
    const tx = appleTransaction({ productId: "worn.coins.100", appAccountToken: userId });
    const jws = signAppleJws(tx);
    const unknown = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { store: "app_store", productId: "coins_9999", transactionId: tx.transactionId, jws },
    });
    expect(unknown.statusCode).toBe(400);
    const bigger = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { store: "app_store", productId: "worn.coins.1500", transactionId: tx.transactionId, jws },
    });
    expect(bigger.statusCode).toBe(402);
    expect(bigger.json().error).toBe("product_mismatch");
    const otherTx = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { store: "app_store", productId: "worn.coins.100", transactionId: "123", jws },
    });
    expect(otherTx.statusCode).toBe(402);
    const noJws = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { store: "app_store", productId: "worn.coins.100", transactionId: tx.transactionId },
    });
    expect(noJws.statusCode).toBe(400);
    const receiptString = await validateApple(headers, tx, "any-receipt-string");
    expect(receiptString.statusCode).toBe(402);
    expect(receiptString.json().error).toBe("invalid_proof");
    expect(await balance(headers)).toBe(0);
  });

  it("409 when the purchase is tied to another account", async () => {
    const a = await user("919800000001");
    const b = await user("919800000002");
    const tx = appleTransaction({ appAccountToken: a.userId });
    const res = await validateApple(b.headers, tx);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("purchase_belongs_to_another_account");
    expect(await balance(b.headers)).toBe(0);
  });

  it("Google Play: verifies the token and asks the app to consume", async () => {
    const { userId, headers } = await user();
    fake.products.set("play-token-1", {
      purchaseState: 0,
      consumptionState: 0,
      orderId: "GPA.1111-2222-3333-44444",
      productId: "worn.coins.650",
      obfuscatedExternalAccountId: playAccountIdForUser(userId),
    });
    const payload = {
      store: "play_store",
      productId: "worn.coins.650",
      transactionId: "GPA.1111-2222-3333-44444",
      purchaseToken: "play-token-1",
    };
    const res = await app.inject({ method: "POST", url: "/coins/iap/validate", headers, payload });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ coinsGranted: 650, balanceAfter: 650, needsConsume: true });

    fake.products.set("play-pending", {
      purchaseState: 2,
      productId: "worn.coins.650",
      orderId: "GPA.9",
      obfuscatedExternalAccountId: playAccountIdForUser(userId),
    });
    const pending = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { ...payload, transactionId: "GPA.9", purchaseToken: "play-pending" },
    });
    expect(pending.statusCode).toBe(402);
    expect(pending.json().error).toBe("purchase_pending");

    fake.failWith = 500;
    const outage = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { ...payload, transactionId: "GPA.10", purchaseToken: "play-token-x" },
    });
    expect(outage.statusCode).toBe(503);
    expect(outage.json()).toEqual({ error: "Unavailable", message: "Purchases are unavailable" });
  });

  it("App Store notification first, then the app's validate: one credit", async () => {
    const { userId, headers } = await user();
    const tx = appleTransaction({ productId: "worn.coins.100", appAccountToken: userId });
    const note = await notify({ notificationType: "ONE_TIME_CHARGE", notificationUUID: randomUUID(), transaction: tx });
    expect(note.statusCode).toBe(200);
    expect(note.json()).toMatchObject({ received: true, duplicate: false });
    expect(await balance(headers)).toBe(100);
    const res = await validateApple(headers, tx);
    expect(res.json()).toMatchObject({ coinsGranted: 100, balanceAfter: 100, alreadyGranted: true });
  });

  it("validate first, then the notification: one credit", async () => {
    const { userId, headers } = await user();
    const tx = appleTransaction({ productId: "worn.coins.100", appAccountToken: userId });
    expect((await validateApple(headers, tx)).json().alreadyGranted).toBe(false);
    await notify({ notificationType: "ONE_TIME_CHARGE", notificationUUID: randomUUID(), transaction: tx });
    expect(await balance(headers)).toBe(100);
  });

  it("a refund takes the coins back, never below zero, and records the shortfall", async () => {
    const { userId, headers } = await user();
    const tx = appleTransaction({ productId: "worn.coins.350", appAccountToken: userId });
    await validateApple(headers, tx);
    await repos.spendCoins({ userId, delta: 300, type: "SPEND_UNLOCK", refType: "test", refId: "spend-1" });
    expect(await balance(headers)).toBe(50);

    const refundUUID = randomUUID();
    const refunded = { ...tx, revocationDate: Date.now(), revocationReason: 0 };
    const res = await notify({ notificationType: "REFUND", notificationUUID: refundUUID, transaction: refunded });
    expect(res.statusCode).toBe(200);
    expect(await balance(headers)).toBe(0);
    const row = await repos.findCoinPurchase("app_store", String(tx.transactionId));
    expect(row).toMatchObject({ coinsGranted: 350, refundedCoins: 50, refundShortfall: 300 });
    expect(row?.refundedAt).toBeInstanceOf(Date);

    // A retried refund changes nothing.
    await notify({ notificationType: "REFUND", notificationUUID: refundUUID, transaction: refunded });
    expect(await balance(headers)).toBe(0);
    // The app retrying validate with the old JWS gets the final, refunded state.
    expect((await validateApple(headers, tx)).json()).toMatchObject({ refunded: true, balanceAfter: 0 });
  });

  it("a refund that arrives before any credit means the purchase never credits", async () => {
    const { userId, headers } = await user();
    const tx = appleTransaction({ productId: "worn.coins.650", appAccountToken: userId });
    await notify({
      notificationType: "REFUND",
      notificationUUID: randomUUID(),
      transaction: { ...tx, revocationDate: Date.now() },
    });
    const res = await validateApple(headers, tx);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ coinsGranted: 0, refunded: true, balanceAfter: 0 });
    expect(await balance(headers)).toBe(0);
  });

  it("notifications: bad signature 400, TEST ignored, unknown account ignored", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/webhooks/app-store",
      payload: { signedPayload: "x.y.z" },
    });
    expect(bad.statusCode).toBe(400);
    const test = await notify({ notificationType: "TEST", notificationUUID: randomUUID() });
    expect(test.json()).toMatchObject({ received: true, ignored: "test" });
    const stranger = await notify({
      notificationType: "ONE_TIME_CHARGE",
      notificationUUID: randomUUID(),
      transaction: appleTransaction({ appAccountToken: randomUUID() }),
    });
    expect(stranger.json()).toMatchObject({ received: true, ignored: "unknown_account" });
  });

  it("subscription notifications set premium, idempotent on notificationUUID", async () => {
    const { userId, headers } = await user();
    const originalTransactionId = "1000000000000777";
    const sub = (overrides: Record<string, unknown>) =>
      appleTransaction({
        type: "Auto-Renewable Subscription",
        productId: "worn.closet.premium.monthly",
        originalTransactionId,
        appAccountToken: userId,
        ...overrides,
      });
    const snapshot = async () =>
      (await app.inject({ method: "GET", url: "/entitlements", headers })).json() as {
        grants: Array<{ entitlementId: string; expiresAt: string | null; source: string }>;
      };

    const renewedUUID = randomUUID();
    const expires = Date.now() + 30 * 86_400_000;
    const first = await notify({
      notificationType: "DID_RENEW",
      notificationUUID: renewedUUID,
      transaction: sub({ expiresDate: expires }),
    });
    expect(first.json()).toMatchObject({ received: true, duplicate: false });
    const grants = (await snapshot()).grants;
    expect(grants.map((g) => g.entitlementId).sort()).toEqual(["accountant", "outfits"]);
    expect(grants.every((g) => g.source === "app_store" && new Date(g.expiresAt!).getTime() === expires)).toBe(true);
    expect((await notify({ notificationType: "DID_RENEW", notificationUUID: renewedUUID, transaction: sub({ expiresDate: expires }) })).json()).toMatchObject({
      duplicate: true,
    });

    // Billing retry with a grace period keeps access until the grace period ends.
    const grace = Date.now() + 6 * 86_400_000;
    await notify({
      notificationType: "DID_FAIL_TO_RENEW",
      subtype: "GRACE_PERIOD",
      notificationUUID: randomUUID(),
      transaction: sub({ expiresDate: Date.now() - 1000, signedDate: Date.now() + 1 }),
      renewal: { originalTransactionId, gracePeriodExpiresDate: grace },
    });
    expect((await snapshot()).grants.every((g) => new Date(g.expiresAt!).getTime() === grace)).toBe(true);

    const revokedAt = Date.now() - 10;
    await notify({
      notificationType: "REVOKE",
      notificationUUID: randomUUID(),
      transaction: sub({ expiresDate: expires, revocationDate: revokedAt, signedDate: Date.now() + 2 }),
    });
    expect((await snapshot()).grants.every((g) => new Date(g.expiresAt!).getTime() === revokedAt)).toBe(true);
  });

  it("entitlements sync: App Store subscription becomes premium; expired is 402", async () => {
    const { userId, headers } = await user();
    const jws = signAppleJws(
      appleTransaction({
        type: "Auto-Renewable Subscription",
        productId: "worn.closet.accountant.monthly",
        appAccountToken: userId,
        expiresDate: Date.now() + 86_400_000,
      }),
    );
    const ok = await app.inject({
      method: "POST",
      url: "/entitlements/sync",
      headers,
      payload: { productId: "closet_accountant_monthly", store: "app_store", jws },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().snapshot.grants).toEqual([
      expect.objectContaining({ entitlementId: "accountant", source: "app_store", isTrial: false }),
    ]);

    const wrongProduct = await app.inject({
      method: "POST",
      url: "/entitlements/sync",
      headers,
      payload: { productId: "closet_premium_monthly", store: "app_store", jws },
    });
    expect(wrongProduct.statusCode).toBe(402);

    const expired = signAppleJws(
      appleTransaction({
        type: "Auto-Renewable Subscription",
        productId: "worn.closet.outfits.monthly",
        appAccountToken: userId,
        expiresDate: Date.now() - 86_400_000,
      }),
    );
    const lapsed = await app.inject({
      method: "POST",
      url: "/entitlements/sync",
      headers,
      payload: { productId: "closet_outfits_monthly", store: "app_store", jws: expired },
    });
    expect(lapsed.statusCode).toBe(402);
    expect(lapsed.json().error).toBe("subscription_inactive");
  });

  it("entitlements sync: Google Play subscription, and another account's is 409", async () => {
    const a = await user("919800000011");
    const b = await user("919800000012");
    fake.subscriptions.set("sub-token", {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      latestOrderId: "GPA.S1",
      externalAccountIdentifiers: { obfuscatedExternalAccountId: playAccountIdForUser(a.userId) },
      lineItems: [{ productId: "worn.closet.premium.monthly", expiryTime: new Date(Date.now() + 86_400_000).toISOString() }],
    });
    const payload = { productId: "closet_premium_monthly", store: "play_store", purchaseToken: "sub-token" };
    const ok = await app.inject({ method: "POST", url: "/entitlements/sync", headers: a.headers, payload });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().snapshot.grants).toHaveLength(2);
    const other = await app.inject({ method: "POST", url: "/entitlements/sync", headers: b.headers, payload });
    expect(other.statusCode).toBe(409);
  });

  it("entitlements sync without proof is 400 unless dev simulation is on", async () => {
    const { headers } = await user();
    const res = await app.inject({
      method: "POST",
      url: "/entitlements/sync",
      headers,
      payload: { productId: "closet_premium_monthly", startTrial: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("coin purchases without store settings", () => {
  const saved: Record<string, string | undefined> = {};
  let app: App;

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  afterEach(async () => {
    await app.close();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("fails closed with 503 for a store that isn't configured", async () => {
    delete process.env.IAP_ALLOW_SIMULATED;
    app = await buildServer({
      logger: false,
      deps: { repos: createMemoryRepositories(), storeConnections: connections(null) },
    });
    const { accessToken } = await login(app);
    const headers = { authorization: `Bearer ${accessToken}` };
    const packs = (await app.inject({ method: "GET", url: "/coins/packs" })).json();
    expect(packs.stores).toEqual({ app_store: true, play_store: false });
    const res = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers,
      payload: { store: "play_store", productId: "worn.coins.100", transactionId: "GPA.1", purchaseToken: "t" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "Unavailable", message: "Purchases are unavailable" });
    const notification = await app.inject({
      method: "POST",
      url: "/webhooks/app-store",
      payload: { signedPayload: "x.y.z" },
    });
    expect(notification.statusCode).toBe(400);
  });

  it("with no store at all: packs unavailable, App Store notifications 503", async () => {
    delete process.env.IAP_ALLOW_SIMULATED;
    app = await buildServer({
      logger: false,
      deps: { repos: createMemoryRepositories(), storeConnections: connections(null, { apple: false }) },
    });
    const packs = (await app.inject({ method: "GET", url: "/coins/packs" })).json();
    expect(packs).toMatchObject({ purchasesAvailable: false, stores: { app_store: false, play_store: false } });
    const notification = await app.inject({
      method: "POST",
      url: "/webhooks/app-store",
      payload: { signedPayload: "x.y.z" },
    });
    expect(notification.statusCode).toBe(503);
  });

  it("simulated purchases only with IAP_ALLOW_SIMULATED=1 outside production", async () => {
    const repos = createMemoryRepositories();
    app = await buildServer({
      logger: false,
      deps: { repos, storeConnections: connections(null, { apple: false }) },
    });
    const { accessToken, userId } = await login(app);
    await zeroBalance(repos, userId);
    const headers = { authorization: `Bearer ${accessToken}` };
    const simulated = (transactionId: string) =>
      app.inject({
        method: "POST",
        url: "/coins/iap/validate",
        headers,
        payload: { store: "app_store", productId: "worn.coins.100", transactionId },
      });

    delete process.env.IAP_ALLOW_SIMULATED;
    expect((await simulated("simulated-1")).statusCode).toBe(503);

    process.env.IAP_ALLOW_SIMULATED = "1";
    const ok = await simulated("simulated-2");
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ coinsGranted: 100, balanceAfter: 100 });
    expect((await simulated("not-simulated")).statusCode).toBe(503);

    process.env.NODE_ENV = "production";
    expect((await simulated("simulated-3")).statusCode).toBe(503);
    process.env.NODE_ENV = "test";

    // Another account can't reuse a credited transaction id.
    const other = await login(app, "919800000099");
    const taken = await app.inject({
      method: "POST",
      url: "/coins/iap/validate",
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { store: "app_store", productId: "worn.coins.100", transactionId: "simulated-2" },
    });
    expect(taken.statusCode).toBe(409);
  });
});
