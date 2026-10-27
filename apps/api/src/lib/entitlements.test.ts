import { describe, expect, it, vi } from "vitest";
import {
  devTrialGrants,
  grantsForProduct,
  premiumGatesEnabled,
  requireEntitlement,
  snapshotForUser,
  subscriptionGrants,
  syncStoreSubscription,
  userCanAccess,
} from "./entitlements.js";
import { routePurchaseVerifier, type PurchaseVerifier, type VerifySubscriptionResult } from "./coin-purchases.js";
import { createMemoryRepositories } from "./repositories/memory.js";

const GATES = { FEATURE_PREMIUM_GATES: "1" } as NodeJS.ProcessEnv;
const DAY = 86_400_000;

function subscription(overrides: Partial<Extract<VerifySubscriptionResult, { ok: true }>["subscription"]> = {}) {
  return {
    store: "app_store" as const,
    productId: "worn.closet.premium.monthly",
    storeRef: "1000000000000001",
    transactionId: "2000000000000001",
    environment: "sandbox" as const,
    expiresAt: new Date(Date.now() + 30 * DAY),
    isTrial: false,
    eventAt: new Date(),
    ...overrides,
  };
}

function verifierAnswering(result: VerifySubscriptionResult): PurchaseVerifier {
  const store: PurchaseVerifier = {
    name: "fake",
    stores: { app_store: true, play_store: true },
    verify: async () => ({ ok: false, reason: "unavailable", message: "n/a" }),
    verifySubscription: async () => result,
  };
  return routePurchaseVerifier({ app_store: store, play_store: store });
}

describe("entitlements", () => {
  it("gates only when FEATURE_PREMIUM_GATES=1", async () => {
    const repos = createMemoryRepositories();
    const userId = "00000000-0000-4000-8000-000000000001";
    expect(premiumGatesEnabled({})).toBe(false);
    expect(premiumGatesEnabled(GATES)).toBe(true);
    expect(await userCanAccess(repos, userId, "outfits", {})).toBe(true);
    expect(await userCanAccess(repos, userId, "accountant", GATES)).toBe(false);
    await repos.applyEntitlementGrants(userId, devTrialGrants("closet_accountant_monthly", new Date()));
    expect(await userCanAccess(repos, userId, "accountant", GATES)).toBe(true);
    expect(await userCanAccess(repos, userId, "outfits", GATES)).toBe(false);
  });

  it("an expired grant gives no access", async () => {
    const repos = createMemoryRepositories();
    const userId = "00000000-0000-4000-8000-000000000002";
    await repos.applyEntitlementGrants(
      userId,
      grantsForProduct("closet_outfits_monthly", {
        expiresAt: new Date(Date.now() - 1000),
        isTrial: false,
        source: "play_store",
        eventAt: new Date(),
      }),
    );
    expect(await userCanAccess(repos, userId, "outfits", GATES)).toBe(false);
    expect((await snapshotForUser(repos, userId)).grants).toEqual([
      expect.objectContaining({ entitlementId: "outfits", source: "play_store", isTrial: false }),
    ]);
  });

  it("maps products and store subscriptions to grants", () => {
    const at = new Date();
    expect(
      grantsForProduct("closet_premium_monthly", {
        expiresAt: null,
        isTrial: false,
        source: "app_store",
        eventAt: at,
        storeRef: "r1",
      }).map((g) => [g.entitlementId, g.storeRef]),
    ).toEqual([
      ["accountant", "r1"],
      ["outfits", "r1"],
    ]);
    expect(grantsForProduct("not_a_product", { expiresAt: null, isTrial: false, source: "dev", eventAt: at })).toEqual(
      [],
    );
    const grants = subscriptionGrants(subscription({ productId: "worn.closet.accountant.monthly" }));
    expect(grants).toEqual([
      expect.objectContaining({
        entitlementId: "accountant",
        productId: "closet_accountant_monthly",
        source: "app_store",
        storeRef: "1000000000000001",
      }),
    ]);
    expect(subscriptionGrants(subscription({ productId: "worn.coins.100" }))).toEqual([]);
    expect(devTrialGrants("closet_premium_monthly", at).every((g) => g.isTrial && g.source === "dev")).toBe(true);
  });

  it("requireEntitlement: 401 without user, 403 when gated, passes when entitled", async () => {
    const repos = createMemoryRepositories();
    const userId = "00000000-0000-4000-8000-000000000011";
    const handler = requireEntitlement("accountant");
    const server = { deps: { repos } };
    const saved = process.env.FEATURE_PREMIUM_GATES;
    process.env.FEATURE_PREMIUM_GATES = "1";
    try {
      const reply401 = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      await handler({ user: undefined, server } as never, reply401 as never);
      expect(reply401.code).toHaveBeenCalledWith(401);

      const reply403 = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      await handler({ user: { sub: userId }, server } as never, reply403 as never);
      expect(reply403.code).toHaveBeenCalledWith(403);

      await repos.applyEntitlementGrants(userId, devTrialGrants("closet_accountant_monthly", new Date()));
      const replyOk = { code: vi.fn().mockReturnThis(), send: vi.fn() };
      expect(await handler({ user: { sub: userId }, server } as never, replyOk as never)).toBeUndefined();
      expect(replyOk.code).not.toHaveBeenCalled();
    } finally {
      if (saved === undefined) delete process.env.FEATURE_PREMIUM_GATES;
      else process.env.FEATURE_PREMIUM_GATES = saved;
    }
  });
});

describe("syncStoreSubscription", () => {
  const userId = "00000000-0000-4000-8000-000000000020";
  const dev = { NODE_ENV: "development", IAP_ALLOW_SIMULATED: "1" } as NodeJS.ProcessEnv;
  const off = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
  const ok = verifierAnswering({ ok: true, subscription: subscription() });

  it("rejects unknown products and missing proof", async () => {
    const repos = createMemoryRepositories();
    expect(await syncStoreSubscription(repos, ok, userId, { productId: "nope", startTrial: true }, dev)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await syncStoreSubscription(repos, ok, userId, { productId: "closet_premium_monthly", startTrial: true }, off),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await syncStoreSubscription(repos, ok, userId, { productId: "closet_premium_monthly", startTrial: true, jws: "x" }, off),
    ).toMatchObject({ ok: false, status: 400, message: "store is required" });
  });

  it("dev simulation: one trial per product, never in production", async () => {
    const repos = createMemoryRepositories();
    const body = { productId: "closet_premium_monthly", startTrial: true };
    const first = await syncStoreSubscription(repos, ok, userId, body, dev);
    expect(first.ok && first.snapshot.grants.map((g) => g.source)).toEqual(["dev", "dev"]);
    const firstExpiry = first.ok ? first.snapshot.grants[0]!.expiresAt : null;
    const again = await syncStoreSubscription(repos, ok, userId, body, dev);
    expect(again.ok && again.snapshot.grants[0]!.expiresAt).toBe(firstExpiry);
    expect(
      await syncStoreSubscription(repos, ok, userId, body, { NODE_ENV: "production", IAP_ALLOW_SIMULATED: "1" }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("stores what the store says", async () => {
    const repos = createMemoryRepositories();
    const result = await syncStoreSubscription(
      repos,
      ok,
      userId,
      { productId: "closet_premium_monthly", startTrial: true, store: "app_store", jws: "signed" },
      off,
    );
    expect(result.ok && result.snapshot.grants.map((g) => [g.entitlementId, g.source])).toEqual([
      ["accountant", "app_store"],
      ["outfits", "app_store"],
    ]);
    expect(await repos.listStoreSubscriptionGrants("app_store", new Date())).toEqual([
      { userId, productId: "closet_premium_monthly", storeRef: "1000000000000001" },
    ]);
  });

  it("maps store answers: wrong product 402, inactive 402, other account 409, outage 503", async () => {
    const repos = createMemoryRepositories();
    const body = { productId: "closet_outfits_monthly", startTrial: true, store: "play_store" as const, purchaseToken: "t" };
    expect(await syncStoreSubscription(repos, ok, userId, body, off)).toMatchObject({
      ok: false,
      status: 402,
      error: "product_mismatch",
    });
    const lapsed = verifierAnswering({
      ok: true,
      subscription: subscription({
        store: "play_store",
        productId: "worn.closet.outfits.monthly",
        expiresAt: new Date(Date.now() - DAY),
      }),
    });
    expect(await syncStoreSubscription(repos, lapsed, userId, body, off)).toMatchObject({
      ok: false,
      status: 402,
      error: "subscription_inactive",
    });
    const other = verifierAnswering({ ok: false, reason: "purchase_belongs_to_another_account", message: "x" });
    expect(await syncStoreSubscription(repos, other, userId, body, off)).toMatchObject({ ok: false, status: 409 });
    const down = verifierAnswering({ ok: false, reason: "unavailable", message: "Google Play responded 503" });
    expect(await syncStoreSubscription(repos, down, userId, body, off)).toMatchObject({
      ok: false,
      status: 503,
      error: "Unavailable",
      message: "Purchases are unavailable",
    });
  });
});
