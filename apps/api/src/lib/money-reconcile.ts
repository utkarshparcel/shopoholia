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
 *  - `reconcileMoneyAccounts(repos, log, { fix, userId })` — pages through
 *    money_accounts (or one user's), compares `balanceCacheMinor` vs
 *    `SUM(delta)` and `last(balanceAfter)`, logs mismatches, and with `fix`
 *    writes the locked SUM into the cache.
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

/** Accounts read per page in the cross-user sweep (bounded memory). */
export const RECONCILE_PAGE_SIZE = 500;

/**
 * Compares each account's cache with SUM(delta) of its ledger. With `userId`
 * only that user's accounts are checked; otherwise every account, a page at a
 * time. The comparison and the fix run per account under its row lock, so a
 * concurrent spend can't be overwritten by a stale value. A ledger whose last
 * `balanceAfter` disagrees with its sum is reported but never "fixed": the
 * cache already equals the sum and the chain needs a human.
 */
export async function reconcileMoneyAccounts(
  repos: Repositories,
  log: FastifyBaseLogger,
  opts: { fix?: boolean; userId?: string } = {},
): Promise<ReconcileResult> {
  const fix = opts.fix ?? true;
  const mismatches: ReconcileMismatch[] = [];
  let fixed = 0;
  let checked = 0;

  const check = async (account: MoneyAccountRecord) => {
    checked++;
    const r = await repos.reconcileMoneyAccount(account.id, account.userId, { fix });
    if (!r || r.entries === 0) return;
    const driftVsSum = r.cachedMinor - r.ledgerSumMinor;
    const driftVsLast = r.lastBalanceAfter == null ? 0 : r.cachedMinor - r.lastBalanceAfter;
    if (driftVsSum === 0 && driftVsLast === 0) return;
    const drift = driftVsSum !== 0 ? driftVsSum : driftVsLast;
    if (r.fixed) fixed++;
    mismatches.push({
      accountId: account.id,
      userId: account.userId,
      merchant: account.merchant,
      cachedMinor: r.cachedMinor,
      ledgerSumMinor: r.ledgerSumMinor,
      lastBalanceAfter: r.lastBalanceAfter,
      driftMinor: drift,
      fixed: r.fixed,
    });
    log.warn(
      {
        accountId: account.id,
        userId: account.userId,
        cached: r.cachedMinor,
        ledgerSum: r.ledgerSumMinor,
        lastBalanceAfter: r.lastBalanceAfter,
        drift,
        fixed: r.fixed,
      },
      "money.reconcile.mismatch",
    );
  };

  if (opts.userId) {
    for (const account of await repos.listMoneyAccounts(opts.userId)) {
      await check(account);
    }
  } else {
    let afterId: string | undefined;
    for (;;) {
      const page = await repos.listAllMoneyAccounts({ afterId, limit: RECONCILE_PAGE_SIZE });
      for (const account of page) await check(account);
      if (page.length < RECONCILE_PAGE_SIZE) break;
      afterId = page[page.length - 1]!.id;
    }
  }

  if (mismatches.length > 0) {
    audit(log, "money.reconciled", {
      checked,
      mismatched: mismatches.length,
      fixed,
      ...(opts.userId ? { userId: opts.userId } : {}),
    });
  }

  return { checked, mismatched: mismatches.length, fixed, mismatches };
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
