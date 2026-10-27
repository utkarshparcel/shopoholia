/**
 * U015 — household shared vault (redacted) + per-member spend cap.
 * No raw card numbers / codes / last4 in share payloads.
 */

import type { HouseholdAuthzDenial } from "./household.js";

export const HOUSEHOLD_VAULT_ACCESS = ["VIEW", "SPEND"] as const;
export type HouseholdVaultAccess = (typeof HOUSEHOLD_VAULT_ACCESS)[number];

/** Default vault ACL: view-only (no mark-spent). */
export const DEFAULT_HOUSEHOLD_VAULT_ACCESS: HouseholdVaultAccess = "VIEW";

export type HouseholdVaultShareAccountInput = {
  id: string;
  ownerUserId: string;
  merchant: string;
  kind: string;
  currency: string;
  balanceCacheMinor: number;
  expiresAt?: string | Date | null;
  /** Sensitive — stripped from share. */
  last4?: string | null;
  code?: string | null;
  cardNumber?: string | null;
  capture?: unknown;
};

export type HouseholdVaultShareAccount = {
  id: string;
  ownerUserId: string;
  /** Redacted merchant label (never raw card data). */
  merchant: string;
  kind: string;
  currency: string;
  balanceCacheMinor: number;
  expiresAt: string | null;
};

/** Strip PII / card secrets from a vault account for household share. */
export function redactHouseholdVaultAccount(
  input: HouseholdVaultShareAccountInput,
): HouseholdVaultShareAccount {
  const exp = input.expiresAt ? new Date(input.expiresAt) : null;
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    merchant: String(input.merchant ?? "").trim() || "Store",
    kind: input.kind,
    currency: input.currency || "INR",
    balanceCacheMinor: Math.max(0, Math.floor(input.balanceCacheMinor)),
    expiresAt:
      exp && !Number.isNaN(exp.getTime()) ? exp.toISOString() : null,
  };
}

export type HouseholdVaultSpendCapCheck = {
  allowed: boolean;
  reason?: "VIEW_ONLY" | "SPEND_CAP_EXCEEDED" | "NOT_MEMBER";
  spentMinor: number;
  capMinor: number | null;
  remainingMinor: number | null;
};

/**
 * Enforce view-only default + optional per-member spend cap on mark-spent.
 * `spentMinor` = sum of prior household vault spends by this member.
 */
export function checkHouseholdVaultSpendCap(input: {
  isMember: boolean;
  vaultAccess: HouseholdVaultAccess | string | null | undefined;
  spendCapMinor: number | null | undefined;
  spentMinor: number;
  amountMinor: number;
}): HouseholdVaultSpendCapCheck {
  if (!input.isMember) {
    return {
      allowed: false,
      reason: "NOT_MEMBER",
      spentMinor: input.spentMinor,
      capMinor: input.spendCapMinor ?? null,
      remainingMinor: null,
    };
  }
  const access = (input.vaultAccess ?? DEFAULT_HOUSEHOLD_VAULT_ACCESS)
    .toString()
    .toUpperCase();
  if (access !== "SPEND") {
    return {
      allowed: false,
      reason: "VIEW_ONLY",
      spentMinor: input.spentMinor,
      capMinor: input.spendCapMinor ?? null,
      remainingMinor: null,
    };
  }
  const cap =
    input.spendCapMinor == null || input.spendCapMinor < 0
      ? null
      : Math.floor(input.spendCapMinor);
  if (cap == null) {
    return {
      allowed: true,
      spentMinor: input.spentMinor,
      capMinor: null,
      remainingMinor: null,
    };
  }
  const next = input.spentMinor + input.amountMinor;
  if (next > cap) {
    return {
      allowed: false,
      reason: "SPEND_CAP_EXCEEDED",
      spentMinor: input.spentMinor,
      capMinor: cap,
      remainingMinor: Math.max(0, cap - input.spentMinor),
    };
  }
  return {
    allowed: true,
    spentMinor: input.spentMinor,
    capMinor: cap,
    remainingMinor: Math.max(0, cap - next),
  };
}

export type HouseholdVaultAclReason =
  | HouseholdAuthzDenial
  | "VIEW_ONLY"
  | "SPEND_CAP_EXCEEDED";

export function friendlyHouseholdVaultAclCopy(
  reason: HouseholdVaultAclReason | string | null | undefined,
): string {
  const upper = (reason ?? "").toString().trim().toUpperCase().replace(/\s+/g, "_");
  if (upper === "VIEW_ONLY") {
    return "Shared vault is view-only for you. Ask the owner to grant spend access.";
  }
  if (upper === "SPEND_CAP_EXCEEDED") {
    return "That spend would exceed your household vault cap.";
  }
  if (upper === "NOT_MEMBER") {
    return "You’re not in this household. Ask for a fresh invite code.";
  }
  if (upper === "NOT_OWNER") {
    return "Only the household owner can change vault spend caps.";
  }
  return "You don’t have access to this shared vault.";
}

/** Assert share payload never includes card secrets (tests + runtime guard). */
export function householdVaultShareHasCardPii(
  payload: Record<string, unknown> | HouseholdVaultShareAccount,
): boolean {
  const json = JSON.stringify(payload).toLowerCase();
  if (/"last4"\s*:/.test(json)) return true;
  if (/"cardnumber"\s*:/.test(json)) return true;
  if (/"code"\s*:/.test(json) && !/"currency"/.test(json)) return true;
  if (/"capture"\s*:/.test(json)) return true;
  return false;
}
