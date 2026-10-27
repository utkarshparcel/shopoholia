/**
 * W094 — Referral deep-link landing microcopy for worn.app/r/{code}.
 * Explains found-money Closet job + install CTA. No PII beyond the code.
 */

export type ReferralLandingCopy = {
  headline: string;
  body: string;
  installCta: string;
  /** Short line under CTA (store-agnostic). */
  installHint: string;
  referralCode: string;
};

/**
 * Landing copy when a friend opens `worn.app/r/{code}`.
 * Closet ethos: forgotten credit utility — never Play try-on lead.
 */
export function buildReferralLandingCopy(
  referralCode: string,
): ReferralLandingCopy {
  const code = String(referralCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return {
    headline: "Find forgotten gift cards before they expire",
    body: "A friend shared WORN Closet — surface store credit, gift cards, and return windows you already paid for. Shares never include card numbers or merchant names.",
    installCta: "Install WORN Closet",
    installHint: "Add a card in under a minute — email is optional.",
    referralCode: code.length >= 4 ? code : "PENDING",
  };
}
