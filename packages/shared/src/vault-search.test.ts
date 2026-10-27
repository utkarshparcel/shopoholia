import { describe, expect, it } from "vitest";
import {
  filterVaultAccounts,
  vaultSearchEmptyCopy,
  vaultSearchHasActiveFilters,
} from "./vault-search.js";

const now = new Date("2026-08-27T00:00:00.000Z");

const accounts = [
  {
    id: "1",
    merchant: "Myntra",
    kind: "GIFT_CARD",
    balanceCacheMinor: 50000,
    expiresAt: "2026-08-30T00:00:00.000Z",
  },
  {
    id: "2",
    merchant: "Amazon",
    kind: "STORE_CREDIT",
    balanceCacheMinor: 0,
    expiresAt: null,
  },
  {
    id: "3",
    merchant: "Nykaa",
    kind: "LOYALTY_POINTS",
    balanceCacheMinor: 1200,
    expiresAt: "2026-07-01T00:00:00.000Z",
  },
];

describe("vault-search (U013)", () => {
  it("filters by merchant query", () => {
    expect(filterVaultAccounts(accounts, { q: "myn", now }).map((a) => a.id)).toEqual([
      "1",
    ]);
  });

  it("filters by kind, balance>0, and expiry window", () => {
    expect(
      filterVaultAccounts(accounts, {
        kinds: ["GIFT_CARD"],
        balancePositive: true,
        expiryWindow: "7d",
        now,
      }).map((a) => a.id),
    ).toEqual(["1"]);
    expect(
      filterVaultAccounts(accounts, { expiryWindow: "expired", now }).map((a) => a.id),
    ).toEqual(["3"]);
    expect(
      filterVaultAccounts(accounts, { expiryWindow: "none", now }).map((a) => a.id),
    ).toEqual(["2"]);
  });

  it("empty copy + active filter detection", () => {
    expect(vaultSearchEmptyCopy(true)).toMatch(/no credits match/i);
    expect(vaultSearchEmptyCopy(false)).toMatch(/no credits yet/i);
    expect(vaultSearchHasActiveFilters({ q: "x" })).toBe(true);
    expect(vaultSearchHasActiveFilters({})).toBe(false);
  });
});
