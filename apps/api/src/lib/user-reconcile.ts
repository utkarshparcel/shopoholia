/**
 * U046 — User-facing money reconcile mismatches + investigate flags.
 */

import type { ReconcileMismatch } from "./money-reconcile.js";

export type UserReconcileMismatch = ReconcileMismatch & {
  investigated: boolean;
  investigatedAt: string | null;
};

/** Per-user investigated account ids. */
const investigated = new Map<string, Map<string, string>>();

export function markReconcileInvestigated(
  userId: string,
  accountId: string,
  now: Date = new Date(),
): { accountId: string; investigatedAt: string } {
  let map = investigated.get(userId);
  if (!map) {
    map = new Map();
    investigated.set(userId, map);
  }
  const at = now.toISOString();
  map.set(accountId, at);
  return { accountId, investigatedAt: at };
}

export function clearReconcileInvestigated(userId?: string): void {
  if (userId) investigated.delete(userId);
  else investigated.clear();
}

export function annotateUserMismatches(
  userId: string,
  mismatches: ReconcileMismatch[],
): UserReconcileMismatch[] {
  const map = investigated.get(userId);
  return mismatches
    .filter((m) => m.userId === userId)
    .map((m) => {
      const at = map?.get(m.accountId) ?? null;
      return {
        ...m,
        investigated: Boolean(at),
        investigatedAt: at,
      };
    });
}

export type ReconcileFixAction = "recalc" | "open_account" | "investigate";

export function reconcileMismatchActions(
  row: UserReconcileMismatch,
): Array<{ action: ReconcileFixAction; label: string; enabled: boolean }> {
  return [
    {
      action: "recalc",
      label: "Recalc",
      enabled: !row.fixed,
    },
    {
      action: "open_account",
      label: "Open account",
      enabled: true,
    },
    {
      action: "investigate",
      label: row.investigated ? "Investigated" : "Mark investigated",
      enabled: !row.investigated,
    },
  ];
}
