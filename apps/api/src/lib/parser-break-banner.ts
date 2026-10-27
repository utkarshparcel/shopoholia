/**
 * U050 — Merchant parser break → user "scanning delayed" banner + manual add.
 * Ops sets health flags; users see honest delay, never fake credits.
 */

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

const flags = new Map<string, ParserBreakFlag>();
const dismissedByUser = new Map<string, Set<string>>();

function key(merchant: string): string {
  return merchant.trim().toUpperCase();
}

export function setParserBreakFlag(input: {
  merchant: string;
  broken: boolean;
  reason?: string;
  region?: string | null;
  now?: Date;
}): ParserBreakFlag {
  const k = key(input.merchant);
  if (!input.broken) {
    flags.delete(k);
    return {
      merchant: input.merchant.trim(),
      broken: false,
      reason: "",
      setAt: (input.now ?? new Date()).toISOString(),
      region: input.region ?? null,
    };
  }
  const row: ParserBreakFlag = {
    merchant: input.merchant.trim(),
    broken: true,
    reason: input.reason?.trim() || "Merchant parser unhealthy",
    setAt: (input.now ?? new Date()).toISOString(),
    region: input.region ?? null,
  };
  flags.set(k, row);
  return row;
}

export function listParserBreakFlags(): ParserBreakFlag[] {
  return [...flags.values()].filter((f) => f.broken);
}

export function clearParserBreakFlags(): void {
  flags.clear();
  dismissedByUser.clear();
}

export function dismissParserBreakBanner(
  userId: string,
  merchant?: string,
): void {
  let set = dismissedByUser.get(userId);
  if (!set) {
    set = new Set();
    dismissedByUser.set(userId, set);
  }
  if (merchant) set.add(key(merchant));
  else {
    for (const f of flags.values()) set.add(key(f.merchant));
  }
}

export function buildParserBreakBanner(userId: string): ParserBreakBanner {
  const dismissed = dismissedByUser.get(userId) ?? new Set();
  const active = listParserBreakFlags().filter(
    (f) => !dismissed.has(key(f.merchant)),
  );
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
