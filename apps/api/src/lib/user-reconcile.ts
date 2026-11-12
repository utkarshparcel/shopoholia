/**
 * U046 — User-facing money reconcile mismatches + investigate flags.
 */

import type { ReconcileMismatch } from "./money-reconcile.js";
import type { Repositories } from "./repositories/types.js";

export type UserReconcileMismatch = ReconcileMismatch & {
  investigated: boolean;
  investigatedAt: string | null;
};

/** Marks the user's account investigated (`money_accounts.reconcile_investigated_at`); null if not theirs. */
export async function markReconcileInvestigated(
  repos: Pick<Repositories, "markMoneyAccountReconcileInvestigated">,
  userId: string,
  accountId: string,
  now: Date = new Date(),
): Promise<{ accountId: string; investigatedAt: string } | null> {
  const at = await repos.markMoneyAccountReconcileInvestigated(accountId, userId, now);
  return at ? { accountId, investigatedAt: at.toISOString() } : null;
}

export async function annotateUserMismatches(
  repos: Pick<Repositories, "listReconcileInvestigatedAccounts">,
  userId: string,
  mismatches: ReconcileMismatch[],
): Promise<UserReconcileMismatch[]> {
  const map = new Map(
    (await repos.listReconcileInvestigatedAccounts(userId)).map((r) => [r.accountId, r.investigatedAt.toISOString()]),
  );
  return mismatches
    .filter((m) => m.userId === userId)
    .map((m) => {
      const at = map.get(m.accountId) ?? null;
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
