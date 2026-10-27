import { describe, expect, it } from "vitest";
import { createPurchaseVerifier } from "../lib/coin-purchases.js";
import { grantsForProduct } from "../lib/entitlements.js";
import { playAccountIdForUser } from "../lib/iap/accounts.js";
import { createPlayClient } from "../lib/iap/google-play.js";
import type { StoreConnections } from "../lib/iap/stores.js";
import { TEST_PACKAGE_NAME, createFakePlay } from "../lib/iap/test-support.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { playStoreReconcile } from "./play-store-reconcile.js";

const DAY = 86_400_000;

async function setup() {
  const repos = createMemoryRepositories();
  const fake = createFakePlay();
  const storeConnections: StoreConnections = {
    apple: null,
    play: {
      packageName: TEST_PACKAGE_NAME,
      production: false,
      client: createPlayClient({
        serviceAccount: fake.serviceAccount,
        allowEndpointOverrides: true,
        apiBaseUrl: fake.apiBaseUrl,
        fetchImpl: fake.fetch,
      }),
    },
  };
  const deps = { repos, storeConnections, purchaseVerifier: createPurchaseVerifier(storeConnections, {}) };
  const { user } = await repos.createUser("919811112222");
  const start = await repos.getCoinBalance(user.id);
  if (start > 0) await repos.spendCoins({ userId: user.id, delta: start, type: "SPEND_UNLOCK", refType: "test", refId: "reset" });
  return { repos, fake, deps, userId: user.id };
}

describe("playStoreReconcile", () => {
  it("takes back voided coin purchases once and re-checks Play subscriptions", async () => {
    const { repos, fake, deps, userId } = await setup();
    await repos.creditCoinPurchase({
      userId,
      store: "play_store",
      transactionId: "GPA.1",
      productId: "worn.coins.350",
      coins: 350,
      environment: "production",
      source: "validate",
    });
    // Keyed on the token when Google gave no order id.
    await repos.creditCoinPurchase({
      userId,
      store: "play_store",
      transactionId: "tok-2",
      productId: "worn.coins.100",
      coins: 100,
      environment: "production",
      source: "validate",
    });
    await repos.spendCoins({ userId, delta: 400, type: "SPEND_UNLOCK", refType: "test", refId: "spend" });
    const now = Date.now();
    fake.voided.push(
      { orderId: "GPA.1", purchaseToken: "tok-1", voidedTimeMillis: String(now - DAY) },
      { purchaseToken: "tok-2", voidedTimeMillis: String(now - DAY) },
      { orderId: "GPA.unknown", purchaseToken: "tok-x", voidedTimeMillis: String(now - DAY) },
    );

    const expiry = new Date(now + 20 * DAY).toISOString();
    const account = { obfuscatedExternalAccountId: playAccountIdForUser(userId) };
    fake.subscriptions.set("sub-renewed", {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      externalAccountIdentifiers: account,
      lineItems: [{ productId: "worn.closet.outfits.monthly", expiryTime: expiry }],
    });
    const grant = (productId: string, storeRef: string) =>
      grantsForProduct(productId, {
        expiresAt: new Date(now + DAY),
        isTrial: false,
        source: "play_store",
        eventAt: new Date(now - DAY),
        storeRef,
      });
    await repos.applyEntitlementGrants(userId, grant("closet_outfits_monthly", "sub-renewed"));
    // Google no longer knows this token: access ends.
    await repos.applyEntitlementGrants(userId, grant("closet_accountant_monthly", "sub-gone"));

    const summary = await playStoreReconcile({}, deps);
    expect(summary).toEqual({ refunds: 2, subscriptionsChecked: 2, subscriptionsEnded: 1 });
    expect(await repos.getCoinBalance(userId)).toBe(0);
    expect(await repos.findCoinPurchase("play_store", "GPA.1")).toMatchObject({
      refundedCoins: 50,
      refundShortfall: 300,
    });
    expect(await repos.findCoinPurchase("play_store", "tok-2")).toMatchObject({
      refundedCoins: 0,
      refundShortfall: 100,
    });

    const grants = await repos.listEntitlementGrants(userId);
    expect(grants.find((g) => g.entitlementId === "outfits")?.expiresAt?.toISOString()).toBe(expiry);
    expect(grants.find((g) => g.entitlementId === "accountant")!.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now());

    // Safe to run twice.
    const again = await playStoreReconcile({}, deps);
    expect(again.refunds).toBe(0);
    expect(await repos.getCoinBalance(userId)).toBe(0);
  });

  it("skips without Google Play settings and fails the run on a Google outage", async () => {
    const { repos, fake, deps, userId } = await setup();
    expect(
      await playStoreReconcile({}, { ...deps, storeConnections: { apple: null, play: null } }),
    ).toMatchObject({ skipped: "play_store_unconfigured" });

    await repos.applyEntitlementGrants(
      userId,
      grantsForProduct("closet_outfits_monthly", {
        expiresAt: new Date(Date.now() + DAY),
        isTrial: false,
        source: "play_store",
        eventAt: new Date(),
        storeRef: "sub-1",
      }),
    );
    fake.subscriptions.set("sub-1", { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE" });
    let calls = 0;
    const realFetch = fake.fetch;
    // Voided purchases answer; the subscription re-check hits an outage.
    fake.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("subscriptionsv2")) {
        calls += 1;
        return new Response("{}", { status: 503 });
      }
      return realFetch(input, init);
    };
    const client = createPlayClient({
      serviceAccount: fake.serviceAccount,
      allowEndpointOverrides: true,
      apiBaseUrl: fake.apiBaseUrl,
      fetchImpl: fake.fetch,
    });
    const storeConnections: StoreConnections = {
      apple: null,
      play: { packageName: TEST_PACKAGE_NAME, production: false, client },
    };
    await expect(
      playStoreReconcile(
        {},
        { repos, storeConnections, purchaseVerifier: createPurchaseVerifier(storeConnections, {}) },
      ),
    ).rejects.toThrow(/Google Play re-check failed/);
    expect(calls).toBe(1);
  });
});
