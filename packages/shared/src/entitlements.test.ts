import { describe, expect, it } from "vitest";
import {
  buildTrialGrants,
  canAccessPremiumSurface,
  closetProductById,
  entitlementsForProduct,
  hasEntitlement,
  isGrantActive,
  trialExpiresAt,
  type EntitlementGrant,
  type EntitlementSnapshot,
} from "./entitlements.js";

describe("entitlements gate", () => {
  const activeGrant: EntitlementGrant = {
    entitlementId: "accountant",
    productId: "closet_accountant_monthly",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    isTrial: true,
    source: "app_store",
  };

  const expiredGrant: EntitlementGrant = {
    ...activeGrant,
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
    isTrial: false,
  };

  it("maps product → entitlements", () => {
    expect(entitlementsForProduct("closet_premium_monthly")).toEqual([
      "accountant",
      "outfits",
    ]);
    expect(closetProductById("nope")).toBeUndefined();
  });

  it("detects active vs expired grants", () => {
    expect(isGrantActive(activeGrant)).toBe(true);
    expect(isGrantActive(expiredGrant)).toBe(false);
    expect(isGrantActive({ ...activeGrant, expiresAt: null })).toBe(true);
  });

  it("hasEntitlement requires matching active grant", () => {
    const snap: EntitlementSnapshot = {
      userId: "00000000-0000-0000-0000-000000000001",
      grants: [activeGrant],
      asOf: new Date().toISOString(),
    };
    expect(hasEntitlement(snap, "accountant")).toBe(true);
    expect(hasEntitlement(snap, "outfits")).toBe(false);
  });

  it("canAccessPremiumSurface allows all when gates disabled", () => {
    expect(
      canAccessPremiumSurface("accountant", null, { gatesEnabled: false }),
    ).toBe(true);
    expect(
      canAccessPremiumSurface("accountant", { grants: [] }, { gatesEnabled: false }),
    ).toBe(true);
  });

  it("canAccessPremiumSurface denies without grant when gates on", () => {
    expect(
      canAccessPremiumSurface("accountant", null, { gatesEnabled: true }),
    ).toBe(false);
    expect(
      canAccessPremiumSurface("accountant", { grants: [activeGrant] }, { gatesEnabled: true }),
    ).toBe(true);
    expect(
      canAccessPremiumSurface("accountant", { grants: [expiredGrant] }, { gatesEnabled: true }),
    ).toBe(false);
  });

  it("builds trial grants with product trialDays", () => {
    const started = new Date("2026-01-01T00:00:00.000Z");
    const grants = buildTrialGrants("closet_premium_monthly", { startedAt: started });
    expect(grants).toHaveLength(2);
    expect(grants.every((g) => g.isTrial)).toBe(true);
    const expected = trialExpiresAt("closet_premium_monthly", started)!;
    expect(grants[0]!.expiresAt).toBe(expected.toISOString());
  });
});
