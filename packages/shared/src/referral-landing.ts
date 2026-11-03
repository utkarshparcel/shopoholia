/**
 * W094 — Referral deep-link landing microcopy for worncloset.app/r/{code}.
 * Worn Play's referral by default; Closet's family share has its own. No PII beyond the code.
 */

import { ONBOARDING_COIN_GRANT, REFERRAL_REWARD_COINS } from "./economy.js";

export type ReferralLandingCopy = {
  headline: string;
  body: string;
  installCta: string;
  /** Short line under CTA (store-agnostic). */
  installHint: string;
  referralCode: string;
};

/** Which product a shared code is for: `/r/{code}` is a Worn Play referral unless Closet's family share made it. */
export type ReferralLandingSurface = "play" | "closet";

/**
 * Landing copy when a friend opens `worncloset.app/r/{code}`. Worn Play's referral by default
 * (the friend earns coins on the new user's first haul); Closet's family share passes "closet".
 */
export function buildReferralLandingCopy(
  referralCode: string,
  surface: ReferralLandingSurface = "play",
): ReferralLandingCopy {
  const code = String(referralCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const referralCodeOut = code.length >= 4 ? code : "PENDING";
  if (surface === "closet") {
    return {
      headline: "Find forgotten gift cards before they expire",
      body: "A friend shared WORN Closet — surface store credit, gift cards, and return windows you already paid for. Shares never include card numbers or merchant names.",
      installCta: "Install WORN Closet",
      installHint: "Add a card in under a minute — email is optional.",
      referralCode: referralCodeOut,
    };
  }
  return {
    headline: "A friend invited you to WORN",
    body: `Shop real pieces with coins, try them on your own avatar and unbox the haul on you. Sign up, then enter this code in Profile → Refer & earn: your friend gets ${REFERRAL_REWARD_COINS} coins when you place your first haul.`,
    installCta: "Get WORN",
    installHint: `Free to play: you start with ${ONBOARDING_COIN_GRANT} coins.`,
    referralCode: referralCodeOut,
  };
}
