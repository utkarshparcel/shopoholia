/**
 * U032 — laundry basket rules: auto-dirty after N wears or sweat tag; batch clean.
 */

export const DEFAULT_LAUNDRY_DIRTY_AFTER_WEARS = 3;
export const SWEAT_TAG = "sweat";

export type LaundryRulesPrefs = {
  /** Auto-mark DIRTY when wearCount reaches this (null = disabled). */
  dirtyAfterWears: number | null;
  /** When true, wear log with sweat tag → DIRTY immediately. */
  dirtyOnSweatTag: boolean;
};

export const DEFAULT_LAUNDRY_RULES: LaundryRulesPrefs = {
  dirtyAfterWears: DEFAULT_LAUNDRY_DIRTY_AFTER_WEARS,
  dirtyOnSweatTag: true,
};

export function normalizeLaundryRules(
  raw: Partial<LaundryRulesPrefs> | null | undefined,
): LaundryRulesPrefs {
  const dirtyAfter =
    raw?.dirtyAfterWears === null
      ? null
      : typeof raw?.dirtyAfterWears === "number" && raw.dirtyAfterWears > 0
        ? Math.min(30, Math.floor(raw.dirtyAfterWears))
        : DEFAULT_LAUNDRY_RULES.dirtyAfterWears;
  return {
    dirtyAfterWears: dirtyAfter,
    dirtyOnSweatTag: raw?.dirtyOnSweatTag ?? DEFAULT_LAUNDRY_RULES.dirtyOnSweatTag,
  };
}

export type LaundryStatus = "CLEAN" | "DIRTY" | "IN_LAUNDRY";

/**
 * Decide next laundry status after a wear, given rules + tags + new wear count.
 * Never downgrades IN_LAUNDRY (already at cleaners).
 */
export function applyLaundryRuleAfterWear(opts: {
  current: LaundryStatus;
  wearCountAfter: number;
  tags?: string[] | null;
  rules?: Partial<LaundryRulesPrefs> | null;
}): LaundryStatus {
  if (opts.current === "IN_LAUNDRY") return "IN_LAUNDRY";
  const rules = normalizeLaundryRules(opts.rules);
  const tags = (opts.tags ?? []).map((t) => t.toLowerCase());
  if (rules.dirtyOnSweatTag && tags.includes(SWEAT_TAG)) return "DIRTY";
  if (
    rules.dirtyAfterWears != null &&
    opts.wearCountAfter > 0 &&
    opts.wearCountAfter % rules.dirtyAfterWears === 0
  ) {
    return "DIRTY";
  }
  return opts.current;
}

/** IDs eligible for batch mark-clean (DIRTY or IN_LAUNDRY). */
export function laundryBasketItemIds(
  items: Array<{ id: string; laundryStatus?: LaundryStatus | null }>,
): string[] {
  return items
    .filter((i) => i.laundryStatus === "DIRTY" || i.laundryStatus === "IN_LAUNDRY")
    .map((i) => i.id);
}
