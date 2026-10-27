/**
 * Money reconciliation job — Worn is source of truth for balances; merchant is mirror
 *
 * See apps/api/src/lib/money-reconcile.ts for the full decision record.
 * This worker-side wrapper re-exports the same logic so the periodic BullMQ
 * job can run without importing from the API package.
 *
 * Drift semantics:
 *  - `money_accounts.balanceCacheMinor` is the denormalized cache for reads.
 *  - `money_ledger` (sum(delta) + last(balanceAfter)) is the durable truth.
 *  - If they disagree, we heal the cache from the ledger and log a warning.
 *
 * The job is idempotent and safe to run concurrently (memory path uses
 * per-user locking; Postgres path uses row locks — see postMoneyLedger).
 */

export type MoneyAccountLike = {
  id: string;
  userId: string;
  merchant: string;
  balanceCacheMinor: number;
  createdAt: Date;
};

export type MoneyLedgerLike = {
  accountId: string;
  userId: string;
  delta: number;
  balanceAfter: number;
  createdAt: Date;
};

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

export interface ReconcileDeps {
  listAllMoneyAccounts(): Promise<MoneyAccountLike[]>;
  listMoneyLedger(accountId: string, userId: string): Promise<MoneyLedgerLike[]>;
  fixMoneyAccountCache(accountId: string, userId: string, correctBalance: number): Promise<void>;
  logWarn?(meta: Record<string, unknown>, msg: string): void;
}

export async function reconcileMoneyAccountsWorker(
  deps: ReconcileDeps,
  opts: { fix?: boolean } = {},
): Promise<ReconcileResult> {
  const fix = opts.fix ?? true;
  const accounts = await deps.listAllMoneyAccounts();
  const mismatches: ReconcileMismatch[] = [];
  let fixed = 0;

  for (const account of accounts) {
    const ledger = await deps.listMoneyLedger(account.id, account.userId);
    if (ledger.length === 0) continue;
    const ledgerSum = ledger.reduce((s, e) => s + e.delta, 0);
    const last = [...ledger].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    const lastBalanceAfter = last.balanceAfter;
    const driftVsSum = account.balanceCacheMinor - ledgerSum;
    const driftVsLast = account.balanceCacheMinor - lastBalanceAfter;
    const hasDrift = driftVsSum !== 0 || driftVsLast !== 0;
    if (!hasDrift) continue;

    const drift = driftVsSum !== 0 ? driftVsSum : driftVsLast;
    let didFix = false;
    if (fix) {
      try {
        await deps.fixMoneyAccountCache(account.id, account.userId, lastBalanceAfter);
        didFix = true;
        fixed++;
      } catch {
        // report as not fixed
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
    deps.logWarn?.(
      { accountId: account.id, userId: account.userId, cached: account.balanceCacheMinor, ledgerSum, lastBalanceAfter, drift },
      "money.reconcile.mismatch",
    );
  }

  return { checked: accounts.length, mismatched: mismatches.length, fixed, mismatches };
}
