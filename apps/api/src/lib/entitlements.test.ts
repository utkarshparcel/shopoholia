import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetEntitlementsForTests,
  grantPaid,
  grantTrial,
  processRevenueCatWebhook,
  premiumGatesEnabled,
  requireEntitlement,
  snapshotForUser,
  userCanAccess,
} from "./entitlements.js";

describe("entitlements + RevenueCat webhook", () => {
  const original = {
    FEATURE_PREMIUM_GATES: process.env.FEATURE_PREMIUM_GATES,
    FEATURE_REVENUECAT: process.env.FEATURE_REVENUECAT,
    REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET,
  };

  beforeEach(() => {
    __resetEntitlementsForTests();
    delete process.env.FEATURE_PREMIUM_GATES;
    delete process.env.FEATURE_REVENUECAT;
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("gates accountant when FEATURE_PREMIUM_GATES=1", () => {
    process.env.FEATURE_PREMIUM_GATES = "1";
    expect(premiumGatesEnabled()).toBe(true);
    const userId = "00000000-0000-4000-8000-000000000001";
    expect(userCanAccess(userId, "accountant")).toBe(false);
    grantTrial(userId, "closet_accountant_monthly");
    expect(userCanAccess(userId, "accountant")).toBe(true);
    expect(userCanAccess(userId, "outfits")).toBe(false);
  });

  it("allows surfaces when gates flag off", () => {
    const userId = "00000000-0000-4000-8000-000000000002";
    expect(userCanAccess(userId, "outfits")).toBe(true);
  });

  it("grantPaid with future expiry unlocks surface under gates", () => {
    process.env.FEATURE_PREMIUM_GATES = "1";
    const userId = "00000000-0000-4000-8000-000000000010";
    const expires = new Date(Date.now() + 30 * 86_400_000);
    grantPaid(userId, "closet_outfits_monthly", expires);
    expect(userCanAccess(userId, "outfits")).toBe(true);
    expect(userCanAccess(userId, "accountant")).toBe(false);
  });

  it("requireEntitlement 401 without user, 403 when gated, pass when entitled", async () => {
    process.env.FEATURE_PREMIUM_GATES = "1";
    const userId = "00000000-0000-4000-8000-000000000011";
    const handler = requireEntitlement("accountant");

    const reply401 = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await handler({ user: undefined } as never, reply401 as never);
    expect(reply401.code).toHaveBeenCalledWith(401);

    const reply403 = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await handler({ user: { sub: userId } } as never, reply403 as never);
    expect(reply403.code).toHaveBeenCalledWith(403);

    grantTrial(userId, "closet_accountant_monthly");
    const replyOk = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    const out = await handler({ user: { sub: userId } } as never, replyOk as never);
    expect(out).toBeUndefined();
    expect(replyOk.code).not.toHaveBeenCalled();
  });

  it("processes RevenueCat webhook when feature flag on", () => {
    process.env.FEATURE_REVENUECAT = "1";
    const userId = "00000000-0000-4000-8000-000000000003";
    const result = processRevenueCatWebhook({
      event: {
        id: "evt-1",
        type: "INITIAL_PURCHASE",
        app_user_id: userId,
        product_id: "closet_premium_monthly",
        period_type: "TRIAL",
      },
    });
    expect(result.ok).toBe(true);
    const snap = snapshotForUser(userId);
    expect(snap.grants.map((g) => g.entitlementId).sort()).toEqual([
      "accountant",
      "outfits",
    ]);
  });

  it("EXPIRATION / CANCELLATION revoke access under gates", () => {
    process.env.FEATURE_REVENUECAT = "1";
    process.env.FEATURE_PREMIUM_GATES = "1";
    const userId = "00000000-0000-4000-8000-000000000012";
    grantPaid(userId, "closet_premium_monthly", new Date(Date.now() + 86_400_000));
    expect(userCanAccess(userId, "accountant")).toBe(true);

    const expired = processRevenueCatWebhook({
      event: {
        id: "evt-exp",
        type: "EXPIRATION",
        app_user_id: userId,
        product_id: "closet_premium_monthly",
      },
    });
    expect(expired.ok).toBe(true);
    expect(userCanAccess(userId, "accountant")).toBe(false);

    grantPaid(userId, "closet_premium_monthly", new Date(Date.now() + 86_400_000));
    const cancelled = processRevenueCatWebhook({
      event: {
        id: "evt-cancel",
        type: "CANCELLATION",
        app_user_id: userId,
        product_id: "closet_premium_monthly",
      },
    });
    expect(cancelled.ok).toBe(true);
    expect(userCanAccess(userId, "outfits")).toBe(false);
  });

  it("rejects unknown product", () => {
    process.env.FEATURE_REVENUECAT = "1";
    const result = processRevenueCatWebhook({
      event: {
        id: "evt-unk",
        type: "INITIAL_PURCHASE",
        app_user_id: "00000000-0000-4000-8000-000000000013",
        product_id: "not_a_real_sku",
      },
    });
    expect(result).toEqual({ ok: false, reason: "unknown_product" });
  });

  it("rejects webhook without secret when secret configured", () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "rc-secret";
    const result = processRevenueCatWebhook(
      { event: { id: "x", app_user_id: "u", product_id: "closet_premium_monthly" } },
      { authorization: "Bearer wrong" },
    );
    expect(result).toEqual({ ok: false, reason: "invalid_webhook_secret" });
  });

  it("is idempotent on event id", () => {
    process.env.FEATURE_REVENUECAT = "1";
    const body = {
      event: {
        id: "evt-dup",
        type: "INITIAL_PURCHASE",
        app_user_id: "00000000-0000-4000-8000-000000000004",
        product_id: "closet_outfits_monthly",
      },
    };
    expect(processRevenueCatWebhook(body).ok).toBe(true);
    const again = processRevenueCatWebhook(body);
    expect(again).toEqual({ ok: true, duplicate: true });
  });
});
