/**
 * U050 — Merchant parser break → user "scanning delayed" banner + manual add.
 * Ops sets health flags; users see honest delay, never fake credits.
 */

import type { Repositories } from "./repositories/types.js";

export type ParserBreakFlag = {
  merchant: string;
  broken: boolean;
  reason: string;
  setAt: string;
  /** Optional region hint. */
  region?: string | null;
};

export type ParserBreakBanner = {
  visible: boolean;
  title: string;
  body: string;
  manualAddLabel: string;
  manualAddHref: string;
  dismissLabel: string;
  merchants: string[];
  /** Explicit: never invent balances while scanning is delayed. */
  inventCredits: false;
};

type BannerRepos = Pick<Repositories, "listParserBreakFlags" | "getUserPrefs">;

/** `users.prefs.dismissedParserBreakMerchants` keeps the newest 50. */
const MAX_DISMISSED = 50;

function key(merchant: string): string {
  return merchant.trim().toUpperCase();
}

/**
 * A dismissal hides one raising of a flag (merchant key + when it was raised), so the banner
 * comes back if that merchant's parser breaks again later.
 */
function dismissalToken(flag: { merchantKey: string; setAt: Date }): string {
  return `${flag.merchantKey}@${flag.setAt.toISOString()}`;
}

/** Raises or clears a merchant's flag (`parser_break_flags`, shared by every API instance). */
export async function setParserBreakFlag(
  repos: Pick<Repositories, "setParserBreakFlag" | "clearParserBreakFlag">,
  input: {
    merchant: string;
    broken: boolean;
    reason?: string;
    region?: string | null;
    now?: Date;
  },
): Promise<ParserBreakFlag> {
  const setAt = input.now ?? new Date();
  const k = key(input.merchant);
  if (!input.broken) {
    await repos.clearParserBreakFlag(k);
    return {
      merchant: input.merchant.trim(),
      broken: false,
      reason: "",
      setAt: setAt.toISOString(),
      region: input.region ?? null,
    };
  }
  const row: ParserBreakFlag = {
    merchant: input.merchant.trim(),
    broken: true,
    reason: input.reason?.trim() || "Merchant parser unhealthy",
    setAt: setAt.toISOString(),
    region: input.region ?? null,
  };
  await repos.setParserBreakFlag({
    merchantKey: k,
    merchant: row.merchant,
    reason: row.reason,
    region: row.region ?? null,
    setAt,
  });
  return row;
}

export async function listParserBreakFlags(
  repos: Pick<Repositories, "listParserBreakFlags">,
): Promise<ParserBreakFlag[]> {
  return (await repos.listParserBreakFlags()).map((f) => ({
    merchant: f.merchant,
    broken: true,
    reason: f.reason,
    setAt: f.setAt.toISOString(),
    region: f.region,
  }));
}

/**
 * Hides the banner for one flagged merchant, or for every merchant flagged now. Kept in
 * `users.prefs`, so it holds on every instance and after a restart.
 */
export async function dismissParserBreakBanner(
  repos: BannerRepos & Pick<Repositories, "patchUserPrefs">,
  userId: string,
  merchant?: string,
): Promise<void> {
  const [flags, prefs] = await Promise.all([repos.listParserBreakFlags(), repos.getUserPrefs(userId)]);
  const add = flags.filter((f) => !merchant || f.merchantKey === key(merchant)).map(dismissalToken);
  if (add.length === 0) return;
  // Tokens of flags no longer raised are dropped: they can never match again.
  const live = new Set(flags.map(dismissalToken));
  const current = (prefs?.dismissedParserBreakMerchants ?? []).filter((t) => live.has(t) && !add.includes(t));
  const next = [...current, ...add].slice(-MAX_DISMISSED);
  if (!(await repos.patchUserPrefs(userId, { dismissedParserBreakMerchants: next }))) {
    throw new Error("user prefs not saved: user not found");
  }
}

export async function buildParserBreakBanner(repos: BannerRepos, userId: string): Promise<ParserBreakBanner> {
  const [flags, prefs] = await Promise.all([repos.listParserBreakFlags(), repos.getUserPrefs(userId)]);
  const dismissed = new Set(prefs?.dismissedParserBreakMerchants ?? []);
  const active = flags.filter((f) => !dismissed.has(dismissalToken(f)));
  if (active.length === 0) {
    return {
      visible: false,
      title: "",
      body: "",
      manualAddLabel: "Add manually",
      manualAddHref: "/(closet)/vault",
      dismissLabel: "Dismiss",
      merchants: [],
      inventCredits: false,
    };
  }
  const merchants = active.map((f) => f.merchant);
  const names =
    merchants.length === 1
      ? merchants[0]!
      : `${merchants.slice(0, 2).join(", ")}${merchants.length > 2 ? "…" : ""}`;
  return {
    visible: true,
    title: "Scanning delayed",
    body: `We're fixing ${names} email/SMS parsing. Your vault won't invent credits — add gift cards or receipts manually meanwhile.`,
    manualAddLabel: "Add manually",
    manualAddHref: "/(closet)/vault",
    dismissLabel: "Dismiss",
    merchants,
    inventCredits: false,
  };
}
