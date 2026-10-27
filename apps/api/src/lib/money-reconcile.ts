/**
 * Money Ledger Reconciliation — "Worn is source of truth for balances; merchant is mirror"
 *
 * Decision: Worn's `money_accounts.balanceCacheMinor` is the canonical balance
 * for every vault account (gift card, store credit, cash). The merchant ledger
 * (the sum of `money_ledger.delta` per account, and the last `balanceAfter`)
 * is the mirror — it should converge to the cache, but if it drifts we fix the
 * cache from the ledger, not the other way around. Rationale:
 *  - The ledger is append-only + idempotency-gated (unique on (userId, refId, type)),
 *    so it is the durable, auditable history.
 *  - The cache is a denormalized convenience for reads (avoids SUM on every GET /credits).
 *  - Row-level locking in `postLedgerEntry` (`SELECT ... FOR UPDATE`) ensures
 *    the ledger remains consistent under concurrent spend.
 *  - A periodic reconciliation job detects drift (e.g. from a failed cache write
 *    or manual DB edit) and heals the cache.
 *
 * This module exposes:
 *  - `reconcileMoneyAccounts(repos, log)` — scans all money_accounts, compares
 *    `balanceCacheMinor` vs `SUM(delta)` and `last(balanceAfter)`, logs mismatches,
 *    and patches the cache when drift is found.
 *  - It is invoked by `GET /admin/money/reconcile` (auth-gated, audit-logged) and
 *    by the `services/worker-expiry` reconciliation job (see reconcile.ts there).
 */

import { audit } from "./audit.js";
import type { MoneyAccountRecord, Repositories } from "./repositories/types.js";
import type { FastifyBaseLogger } from "fastify";

export type ReconcileMismatch = {
  accountId: string;
  userId: string;
  merchant: string;
  cachedMinor: number;
  ledgerSumMinor: number;
  lastBalanceAfter: number | null;
  driftMinor: number;
  fixed: boolean;
};

export type ReconcileResult = {
  checked: number;
  mismatched: number;
  fixed: number;
  mismatches: ReconcileMismatch[];
};

export async function reconcileMoneyAccounts(
  repos: Repositories,
  log: FastifyBaseLogger,
  opts: { fix?: boolean } = {},
): Promise<ReconcileResult> {
  const fix = opts.fix ?? true;

  const allAccounts = await repos.listAllMoneyAccounts();
  const mismatches: ReconcileMismatch[] = [];
  let fixed = 0;

  for (const account of allAccounts) {
    const ledger = await repos.listMoneyLedger(account.id, account.userId);
    if (ledger.length === 0) continue;

    const ledgerSum = ledger.reduce((sum, e) => sum + e.delta, 0);
    // The ledger is append-only; the latest entry's balanceAfter is the true balance
    const last = [...ledger].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    const lastBalanceAfter = last.balanceAfter;

    // Canonical check: cache should equal sum of deltas (since we start at 0)
    // and also equal lastBalanceAfter. We compare against both; either mismatch is drift.
    const driftVsSum = account.balanceCacheMinor - ledgerSum;
    const driftVsLast = account.balanceCacheMinor - lastBalanceAfter;
    const hasDrift = driftVsSum !== 0 || driftVsLast !== 0;

    if (!hasDrift) continue;

    const drift = driftVsSum !== 0 ? driftVsSum : driftVsLast;
    let didFix = false;
    if (fix) {
      try {
        await repos.fixMoneyAccountCache(account.id, account.userId, lastBalanceAfter);
        didFix = true;
        fixed++;
      } catch {
        // leave as not fixed, will be reported
      }
    }

    mismatches.push({
      accountId: account.id,
      userId: account.userId,
      merchant: account.merchant,
      cachedMinor: account.balanceCacheMinor,
      ledgerSumMinor: ledgerSum,
      lastBalanceAfter,
      driftMinor: drift,
      fixed: didFix,
    });

    log.warn(
      { accountId: account.id, userId: account.userId, cached: account.balanceCacheMinor, ledgerSum, lastBalanceAfter, drift },
      "money.reconcile.mismatch",
    );
  }

  if (mismatches.length > 0) {
    audit(log, "money.reconciled", { checked: allAccounts.length, mismatched: mismatches.length, fixed });
  }

  return { checked: allAccounts.length, mismatched: mismatches.length, fixed, mismatches };
}

/** Adapter so worker-expiry can reuse the same heal path without importing the API package shape. */
export function toWorkerReconcileDeps(repos: Repositories): {
  listAllMoneyAccounts(): Promise<Pick<MoneyAccountRecord, "id" | "userId" | "merchant" | "balanceCacheMinor" | "createdAt">[]>;
  listMoneyLedger(
    accountId: string,
    userId: string,
  ): Promise<Array<{ accountId: string; userId: string; delta: number; balanceAfter: number; createdAt: Date }>>;
  fixMoneyAccountCache(accountId: string, userId: string, correctBalance: number): Promise<void>;
} {
  return {
    listAllMoneyAccounts: () => repos.listAllMoneyAccounts(),
    listMoneyLedger: async (accountId, userId) => {
      const rows = await repos.listMoneyLedger(accountId, userId);
      return rows.map((e) => ({
        accountId: e.accountId,
        userId: e.userId,
        delta: e.delta,
        balanceAfter: e.balanceAfter,
        createdAt: e.createdAt,
      }));
    },
    fixMoneyAccountCache: (accountId, userId, correctBalance) =>
      repos.fixMoneyAccountCache(accountId, userId, correctBalance),
  };
}
