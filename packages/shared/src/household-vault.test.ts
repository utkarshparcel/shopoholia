import { describe, expect, it } from "vitest";
import {
  checkHouseholdVaultSpendCap,
  friendlyHouseholdVaultAclCopy,
  householdVaultShareHasCardPii,
  redactHouseholdVaultAccount,
} from "./household-vault.js";

describe("household-vault (U015)", () => {
  it("redacts card secrets from share accounts", () => {
    // UUIDs deliberately avoid 4111/4242 so stringify asserts don't false-positive.
    const shared = redactHouseholdVaultAccount({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      ownerUserId: "ffffffff-0000-4000-8000-111111111111",
      merchant: "Myntra",
      kind: "GIFT_CARD",
      currency: "INR",
      balanceCacheMinor: 50000,
      expiresAt: "2026-12-01T00:00:00.000Z",
      last4: "4242",
      code: "SECRET-CODE",
      cardNumber: "4111111111111111",
      capture: { raw: "pan" },
    });
    expect(shared).not.toHaveProperty("last4");
    expect(shared).not.toHaveProperty("code");
    expect(shared).not.toHaveProperty("cardNumber");
    expect(shared).not.toHaveProperty("capture");
    expect(householdVaultShareHasCardPii(shared as never)).toBe(false);
    expect(JSON.stringify(shared)).not.toMatch(/4242|SECRET-CODE|4111111111111111/);
  });

  it("defaults to view-only and enforces spend cap", () => {
    expect(
      checkHouseholdVaultSpendCap({
        isMember: true,
        vaultAccess: "VIEW",
        spendCapMinor: 10_000,
        spentMinor: 0,
        amountMinor: 100,
      }).reason,
    ).toBe("VIEW_ONLY");

    const ok = checkHouseholdVaultSpendCap({
      isMember: true,
      vaultAccess: "SPEND",
      spendCapMinor: 1000,
      spentMinor: 400,
      amountMinor: 500,
    });
    expect(ok.allowed).toBe(true);
    expect(ok.remainingMinor).toBe(100);

    const over = checkHouseholdVaultSpendCap({
      isMember: true,
      vaultAccess: "SPEND",
      spendCapMinor: 1000,
      spentMinor: 400,
      amountMinor: 700,
    });
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe("SPEND_CAP_EXCEEDED");
    expect(over.remainingMinor).toBe(600);
    expect(friendlyHouseholdVaultAclCopy("SPEND_CAP_EXCEEDED")).toMatch(/cap/i);
    expect(friendlyHouseholdVaultAclCopy("VIEW_ONLY")).toMatch(/view-only/i);
  });

  it("covers redact edges, unlimited spend, non-member, and ACL copy", () => {
    const blank = redactHouseholdVaultAccount({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      ownerUserId: "ffffffff-0000-4000-8000-111111111111",
      merchant: "  ",
      kind: "STORE_CREDIT",
      currency: "",
      balanceCacheMinor: -50.9,
      expiresAt: "not-a-date",
    });
    expect(blank.merchant).toBe("Store");
    expect(blank.currency).toBe("INR");
    expect(blank.balanceCacheMinor).toBe(0);
    expect(blank.expiresAt).toBeNull();

    const noExp = redactHouseholdVaultAccount({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      ownerUserId: "ffffffff-0000-4000-8000-111111111111",
      merchant: "Ajio",
      kind: "GIFT_CARD",
      currency: "USD",
      balanceCacheMinor: 100,
      expiresAt: null,
    });
    expect(noExp.expiresAt).toBeNull();

    expect(
      checkHouseholdVaultSpendCap({
        isMember: false,
        vaultAccess: "SPEND",
        spendCapMinor: 1000,
        spentMinor: 0,
        amountMinor: 100,
      }).reason,
    ).toBe("NOT_MEMBER");

    // null vaultAccess → VIEW default
    expect(
      checkHouseholdVaultSpendCap({
        isMember: true,
        vaultAccess: null,
        spendCapMinor: null,
        spentMinor: 0,
        amountMinor: 100,
      }).reason,
    ).toBe("VIEW_ONLY");

    const unlimited = checkHouseholdVaultSpendCap({
      isMember: true,
      vaultAccess: "spend",
      spendCapMinor: null,
      spentMinor: 9_999,
      amountMinor: 1,
    });
    expect(unlimited.allowed).toBe(true);
    expect(unlimited.capMinor).toBeNull();
    expect(unlimited.remainingMinor).toBeNull();

    const negativeCap = checkHouseholdVaultSpendCap({
      isMember: true,
      vaultAccess: "SPEND",
      spendCapMinor: -1,
      spentMinor: 0,
      amountMinor: 50,
    });
    expect(negativeCap.allowed).toBe(true);
    expect(negativeCap.capMinor).toBeNull();

    expect(friendlyHouseholdVaultAclCopy("NOT_MEMBER")).toMatch(/not in this household/i);
    expect(friendlyHouseholdVaultAclCopy("NOT_OWNER")).toMatch(/owner/i);
    expect(friendlyHouseholdVaultAclCopy("unknown")).toMatch(/don.?t have access/i);
    expect(friendlyHouseholdVaultAclCopy(null)).toMatch(/don.?t have access/i);
    expect(friendlyHouseholdVaultAclCopy(" view only ")).toMatch(/view-only/i);

    expect(
      householdVaultShareHasCardPii({
        id: "x",
        last4: "1234",
      } as never),
    ).toBe(true);
    expect(householdVaultShareHasCardPii({ cardNumber: "4111" } as never)).toBe(true);
    expect(householdVaultShareHasCardPii({ code: "PIN", currency: "INR" } as never)).toBe(
      false,
    );
    expect(householdVaultShareHasCardPii({ code: "PIN" } as never)).toBe(true);
    expect(householdVaultShareHasCardPii({ capture: {} } as never)).toBe(true);
  });
});
