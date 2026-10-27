/**
 * U028 — Broken item → return window vs warranty claim router.
 * One primary path so users don’t pick the wrong chore and lose money.
 */

export type BrokenItemPath = "RETURN" | "WARRANTY" | "NEITHER";

export type BrokenItemRouterInput = {
  now?: Date;
  returnWindowDeadline?: string | Date | null;
  exchangeDeadline?: string | Date | null;
  warrantyCoverageUntil?: string | Date | null;
  /** ACTIVE / CLAIMED / LAPSED / … — only ACTIVE (or missing) counts as claimable. */
  warrantyState?: string | null;
  itemTitle?: string | null;
};

export type BrokenItemPrimaryCta = {
  kind: "INITIATE_RETURN" | "CLAIM_WARRANTY" | "NONE";
  label: string;
};

export type BrokenItemRouterResult = {
  path: BrokenItemPath;
  reason: string;
  primary: BrokenItemPrimaryCta;
  /** Optional secondary hint when both windows exist but return wins. */
  secondaryHint?: string | null;
};

function asTime(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function isWarrantyClaimable(state: string | null | undefined): boolean {
  if (!state) return true;
  const s = state.toUpperCase();
  return s === "ACTIVE" || s === "SNOOZED";
}

/**
 * Decision tree: open return/exchange window → return; else in-coverage warranty → claim; else neither.
 */
export function routeBrokenItem(input: BrokenItemRouterInput): BrokenItemRouterResult {
  const now = (input.now ?? new Date()).getTime();
  const returnEnd = asTime(input.returnWindowDeadline);
  const exchangeEnd = asTime(input.exchangeDeadline);
  const windowEnd =
    returnEnd != null && exchangeEnd != null
      ? Math.max(returnEnd, exchangeEnd)
      : (returnEnd ?? exchangeEnd);
  const returnOpen = windowEnd != null && windowEnd > now;

  const coverageEnd = asTime(input.warrantyCoverageUntil);
  const warrantyOpen =
    coverageEnd != null && coverageEnd > now && isWarrantyClaimable(input.warrantyState);

  const item = input.itemTitle?.trim() || "this item";

  if (returnOpen) {
    return {
      path: "RETURN",
      reason: `Return window is still open for ${item} — use return/refund first (faster than warranty).`,
      primary: { kind: "INITIATE_RETURN", label: "Start return" },
      secondaryHint: warrantyOpen
        ? "Warranty stays available after the return window if the merchant denies the return."
        : null,
    };
  }

  if (warrantyOpen) {
    return {
      path: "WARRANTY",
      reason: `Return window closed for ${item}, but warranty coverage is still active — file a warranty claim.`,
      primary: { kind: "CLAIM_WARRANTY", label: "Claim warranty" },
      secondaryHint: null,
    };
  }

  if (windowEnd != null && coverageEnd != null) {
    return {
      path: "NEITHER",
      reason: `Both return and warranty windows have closed for ${item}. Contact the merchant support portal manually.`,
      primary: { kind: "NONE", label: "No in-app path" },
      secondaryHint: null,
    };
  }

  if (windowEnd == null && coverageEnd == null) {
    return {
      path: "NEITHER",
      reason: `No return deadline or warranty on file for ${item}. Add a receipt or check the merchant app.`,
      primary: { kind: "NONE", label: "No in-app path" },
      secondaryHint: null,
    };
  }

  return {
    path: "NEITHER",
    reason: returnOpen
      ? `Unexpected state for ${item}.`
      : coverageEnd != null
        ? `Warranty coverage ended for ${item}.`
        : `Return window closed for ${item} and no active warranty was found.`,
    primary: { kind: "NONE", label: "No in-app path" },
    secondaryHint: null,
  };
}
