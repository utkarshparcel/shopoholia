import {
  buildFoundMoneyShareCard,
  type FoundMoneyShareCard,
  type FoundMoneyShareInput,
} from "./found-money.js";

/** Public origin for family / referral deep links. */
export const FAMILY_SHARE_ORIGIN = "https://worn.app";

/**
 * Build `worn.app/r/{code}` deep link for family found-money forwards (N36).
 * Codes are uppercased; empty / invalid → null.
 */
export function buildReferralDeepLink(
  referralCode: string,
  origin: string = FAMILY_SHARE_ORIGIN,
): string | null {
  const code = String(referralCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) return null;
  const base = origin.replace(/\/+$/, "");
  return `${base}/r/${code}`;
}

export type FamilyFoundMoneyShareInput = FoundMoneyShareInput & {
  referralCode: string;
  /** Override origin (tests / staging). */
  origin?: string;
};

export type FamilyFoundMoneyShareCard = FoundMoneyShareCard & {
  referralCode: string;
  deepLink: string;
};

/**
 * Found-money share card for household WhatsApp forwards — same redaction as
 * GROW-FOUND-SHARE plus referral deep link for attribution (N36).
 */
export function buildFamilyFoundMoneyShare(
  input: FamilyFoundMoneyShareInput,
): FamilyFoundMoneyShareCard {
  const code = String(input.referralCode ?? "")
    .trim()
    .toUpperCase();
  const deepLink =
    buildReferralDeepLink(code, input.origin) ??
    `${(input.origin ?? FAMILY_SHARE_ORIGIN).replace(/\/+$/, "")}/r/PENDING`;
  const base = buildFoundMoneyShareCard(input);
  const shareText = [base.shareText, deepLink].filter(Boolean).join("\n");
  return {
    ...base,
    referralCode: code.length >= 4 ? code : "PENDING",
    deepLink,
    shareText,
  };
}

/** W024 — chrome line under vault share: “shared via worn.app/r/…”. */
export function familyShareViaLabel(deepLink: string): string {
  const trimmed = deepLink.trim().replace(/^https?:\/\//i, "");
  return `shared via ${trimmed}`;
}

/**
 * Parse referral code from `worn.app/r/{code}`, `https://…/r/{code}`, or raw code.
 */
export function parseFamilyShareReferralCode(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const fromPath = raw.match(/\/r\/([A-Za-z0-9]{4,20})\b/i);
  const code = (fromPath?.[1] ?? raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 4 ? code : null;
}

export type FamilyShareAttributionConfirm = {
  referralCode: string;
  deepLink: string;
  viaLabel: string;
  headline: string;
  body: string;
};

/** W024 — attribution confirm screen copy (no PII beyond referral code). */
export function buildFamilyShareAttributionConfirm(
  referralCode: string,
  opts?: { origin?: string },
): FamilyShareAttributionConfirm | null {
  const deepLink = buildReferralDeepLink(referralCode, opts?.origin);
  if (!deepLink) return null;
  const code = parseFamilyShareReferralCode(referralCode) ?? referralCode.toUpperCase();
  return {
    referralCode: code,
    deepLink,
    viaLabel: familyShareViaLabel(deepLink),
    headline: "Family share credited",
    body: `You opened ${familyShareViaLabel(deepLink)}. Found-money tips stay private — we never put card numbers or merchant names in shares.`,
  };
}
