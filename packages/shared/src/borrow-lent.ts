/**
 * N25 — Borrowed / lent tracker: lent-to + due date + overdue query.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type LentItemLike = {
  id?: string;
  lentTo?: string | null;
  lentDueOn?: string | null;
};

export type LentPatch = {
  lentTo: string | null;
  lentDueOn: string | null;
};

export type ApplyLendInput = {
  lentTo: string;
  dueOn: string; // YYYY-MM-DD
};

/** True when item is currently lent out. */
export function isLentOut(item: LentItemLike): boolean {
  return Boolean((item.lentTo ?? "").trim());
}

/** True when lent and dueOn is on/before asOf (YYYY-MM-DD). */
export function isLentOverdue(item: LentItemLike, asOf: string): boolean {
  if (!isLentOut(item)) return false;
  const due = (item.lentDueOn ?? "").trim();
  if (!DATE_RE.test(due) || !DATE_RE.test(asOf)) return false;
  return due <= asOf;
}

export function applyLend(
  _item: LentItemLike,
  input: ApplyLendInput,
): { ok: true; patch: LentPatch } | { ok: false; error: string } {
  const lentTo = input.lentTo.trim();
  if (!lentTo) return { ok: false, error: "lentTo required" };
  if (!DATE_RE.test(input.dueOn)) {
    return { ok: false, error: "dueOn must be YYYY-MM-DD" };
  }
  return {
    ok: true,
    patch: { lentTo, lentDueOn: input.dueOn },
  };
}

export function applyLendReturn(
  item: LentItemLike,
): { ok: true; patch: LentPatch } | { ok: false; error: string } {
  if (!isLentOut(item)) {
    return { ok: false, error: "item is not lent out" };
  }
  return { ok: true, patch: { lentTo: null, lentDueOn: null } };
}

export type LentDueFilter = "all" | "due" | "overdue";

/**
 * Due query: currently lent items, optionally only those due on/before asOf
 * (`due`) or strictly overdue (`overdue` = dueOn < asOf).
 */
export function filterLentDue<T extends LentItemLike>(
  items: T[],
  opts: { asOf: string; filter?: LentDueFilter } = { asOf: "" },
): T[] {
  const asOf = opts.asOf;
  const filter = opts.filter ?? "all";
  if (!DATE_RE.test(asOf) && filter !== "all") return [];

  return items.filter((item) => {
    if (!isLentOut(item)) return false;
    const due = (item.lentDueOn ?? "").trim();
    if (filter === "all") return true;
    if (!DATE_RE.test(due)) return false;
    if (filter === "due") return due <= asOf;
    // overdue: past due (due before today)
    return due < asOf;
  });
}

/** Sort lent items by due date ascending (nulls last). */
export function sortLentByDueAsc<T extends LentItemLike>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = (a.lentDueOn ?? "").trim();
    const db = (b.lentDueOn ?? "").trim();
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

export type LentOverdueBanner = {
  count: number;
  headline: string;
  body: string;
  /** Primary item id for return flow (soonest overdue). */
  primaryItemId: string | null;
};

/**
 * W063 — overdue lent banner copy; tap routes to return flow via primaryItemId.
 */
export function buildLentOverdueBanner<T extends LentItemLike & { id: string }>(
  items: T[],
  asOf: string,
): LentOverdueBanner | null {
  const overdue = sortLentByDueAsc(filterLentDue(items, { asOf, filter: "overdue" }));
  if (overdue.length === 0) return null;
  const first = overdue[0]!;
  const who = (first.lentTo ?? "someone").trim() || "someone";
  return {
    count: overdue.length,
    headline: overdue.length === 1 ? "Lent item overdue" : `${overdue.length} lent items overdue`,
    body:
      overdue.length === 1
        ? `Due back from ${who} · tap to mark returned`
        : `Soonest: due from ${who} · tap to mark returned`,
    primaryItemId: first.id,
  };
}
