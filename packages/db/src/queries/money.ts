import { createHash } from "node:crypto";
import { TransactionRollbackError, and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { moneyAccounts, moneyLedger } from "../schema/money.js";

export type MoneyLedgerType =
  | "DEPOSIT"
  | "WITHDRAW"
  | "SPEND"
  | "REFUND"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "PURCHASE_REWARD";

type MoneyAccountRow = typeof moneyAccounts.$inferSelect;
type MoneyLedgerRow = typeof moneyLedger.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Pure balance computation with the double-spend guard. Throws on a
 * resulting negative balance. Kept side-effect free so it can be unit tested
 * without a database.
 */
export function computeBalanceAfter(current: number, delta: number): number {
  const next = current + delta;
  if (next < 0) {
    throw new Error("Insufficient money balance");
  }
  return next;
}

/** The only read path for an account balance. Never read the cache raw. */
export async function getAccountBalance(
  db: Db,
  accountId: string,
): Promise<number> {
  const [row] = await db
    .select({ balanceCacheMinor: moneyAccounts.balanceCacheMinor })
    .from(moneyAccounts)
    .where(eq(moneyAccounts.id, accountId))
    .limit(1);

  return row?.balanceCacheMinor ?? 0;
}

/** serialization_failure and deadlock_detected: safe to retry the whole transaction. */
const RETRYABLE_TX_CODES = new Set(["40001", "40P01"]);
export const MONEY_TX_MAX_ATTEMPTS = 3;

export function isRetryableTxError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 3; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && RETRYABLE_TX_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Runs `run` again on 40001/40P01, at most `attempts` times in total, with
 * exponential backoff plus jitter. Any other error, or the last retryable one,
 * is rethrown unchanged.
 */
export async function withTxRetry<T>(
  run: () => Promise<T>,
  opts: {
    attempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const attempts = opts.attempts ?? MONEY_TX_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? 20;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= attempts || !isRetryableTxError(err)) throw err;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      await sleep(backoff + Math.floor(Math.random() * backoff));
    }
  }
}

const LEDGER_REF_NAMESPACE = Buffer.from("8d0f6a3c4e2b5d1a9c7e3f5b2a4d6c8e", "hex");

/**
 * Deterministic ledger ref (RFC 4122 v5 over a fixed Worn namespace), so a
 * retried money operation lands on `money_ledger_ref_id_idx` instead of
 * posting twice.
 */
export function ledgerRefId(...parts: string[]): string {
  if (parts.length === 0) throw new RangeError("ledgerRefId needs at least one part");
  const bytes = createHash("sha1")
    .update(LEDGER_REF_NAMESPACE)
    .update(parts.join("|"))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Row-locks one account for the rest of the transaction and checks ownership. */
async function lockAccount(
  tx: Tx,
  accountId: string,
  userId: string,
): Promise<MoneyAccountRow> {
  const [account] = await tx
    .select()
    .from(moneyAccounts)
    .where(eq(moneyAccounts.id, accountId))
    .for("update");

  if (!account) {
    throw new Error("Money account not found");
  }

  if (account.userId !== userId) {
    throw new Error("Money account does not belong to user");
  }
  return account;
}

/** Appends one ledger row and moves the cache, on an account locked by this tx. */
async function appendLedgerRow(
  tx: Tx,
  account: MoneyAccountRow,
  input: {
    delta: number;
    type: MoneyLedgerType;
    refType?: string;
    refId?: string;
  },
): Promise<{ balanceAfter: number }> {
  const balanceAfter = computeBalanceAfter(
    account.balanceCacheMinor,
    input.delta,
  );

  await tx.insert(moneyLedger).values({
    accountId: account.id,
    userId: account.userId,
    delta: input.delta,
    type: input.type,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    balanceAfter,
  });

  await tx
    .update(moneyAccounts)
    .set({ balanceCacheMinor: balanceAfter, updatedAt: new Date() })
    .where(eq(moneyAccounts.id, account.id));

  account.balanceCacheMinor = balanceAfter;
  return { balanceAfter };
}

async function findLedgerByRef(
  tx: Tx,
  userId: string,
  refId: string,
  type: MoneyLedgerType,
): Promise<MoneyLedgerRow | null> {
  const [row] = await tx
    .select()
    .from(moneyLedger)
    .where(
      and(
        eq(moneyLedger.userId, userId),
        eq(moneyLedger.refId, refId),
        eq(moneyLedger.type, type),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Double-spend-safe money ledger write.
 *
 * All balance mutations MUST go through this module. Each write:
 *  - runs in one READ COMMITTED transaction that takes `FOR UPDATE` on the
 *    account row, which serialises every writer of that account,
 *  - computes balanceAfter from the locked account cache,
 *  - throws on a negative resulting balance (double-spend guard),
 *  - writes the ledger row and updates money_accounts.balanceCacheMinor,
 *  - is retried on 40001/40P01 (bounded, with jitter).
 */
export async function postLedgerEntry(
  db: Db,
  input: {
    accountId: string;
    userId: string;
    delta: number;
    type: MoneyLedgerType;
    refType?: string;
    refId?: string;
  },
): Promise<{ balanceAfter: number }> {
  return withTxRetry(() =>
    db.transaction(async (tx) => {
      const account = await lockAccount(tx, input.accountId, input.userId);
      return appendLedgerRow(tx, account, input);
    }),
  );
}

/**
 * Creates an account and its first ledger row in one transaction, so a failed
 * first post never leaves an empty shell. With a `refId`, a repeat (or a
 * concurrent twin) returns the account that already holds that ref.
 */
export async function createAccountWithLedgerEntry(
  db: Db,
  input: {
    account: {
      userId: string;
      kind: MoneyAccountRow["kind"];
      merchant: string;
      currency: string;
      expiresAt: Date | null;
      status: MoneyAccountRow["status"];
    };
    entry: {
      delta: number;
      type: MoneyLedgerType;
      refType?: string;
      refId?: string;
    };
  },
): Promise<{ account: MoneyAccountRow; created: boolean }> {
  const { userId } = input.account;
  const refId = input.entry.refId;

  const existing = async (): Promise<MoneyAccountRow | null> => {
    if (!refId) return null;
    const [row] = await db
      .select({ account: moneyAccounts })
      .from(moneyLedger)
      .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyLedger.accountId))
      .where(
        and(
          eq(moneyLedger.userId, userId),
          eq(moneyLedger.refId, refId),
          eq(moneyLedger.type, input.entry.type),
        ),
      )
      .limit(1);
    return row?.account ?? null;
  };

  const prior = await existing();
  if (prior) return { account: prior, created: false };

  const balanceAfter = computeBalanceAfter(0, input.entry.delta);
  const result = await withTxRetry(() =>
    db.transaction(async (tx) => {
      const [account] = await tx
        .insert(moneyAccounts)
        .values({ ...input.account, balanceCacheMinor: balanceAfter })
        .returning();
      const inserted = await tx
        .insert(moneyLedger)
        .values({
          accountId: account!.id,
          userId,
          delta: input.entry.delta,
          type: input.entry.type,
          refType: input.entry.refType ?? null,
          refId: refId ?? null,
          balanceAfter,
        })
        .onConflictDoNothing({
          target: [moneyLedger.userId, moneyLedger.refId, moneyLedger.type],
          where: sql.raw("ref_id IS NOT NULL"),
        })
        .returning({ id: moneyLedger.id });
      if (inserted.length === 0) {
        // A concurrent twin committed this ref first: roll our account back.
        tx.rollback();
      }
      return account!;
    }),
  ).catch(async (err: unknown) => {
    if (!(err instanceof TransactionRollbackError)) throw err;
    return null;
  });

  if (result) return { account: result, created: true };
  const winner = await existing();
  if (!winner) throw new Error("Money ledger ref conflict without a winner");
  return { account: winner, created: false };
}

/**
 * "Set the balance to X": computes the delta under the account lock and posts
 * it as a DEPOSIT (up) or SPEND (down) with `refId`. A delta of 0 posts nothing
 * and only touches updated_at. A ref that is already posted returns that row.
 */
export async function setAccountBalance(
  db: Db,
  input: {
    accountId: string;
    userId: string;
    targetMinor: number;
    refType: string;
    /** Called under the lock with the current balance and latest ledger id. */
    refId: (state: { balanceMinor: number; lastLedgerId: string | null }) => string;
  },
): Promise<{ previousMinor: number; balanceAfter: number; delta: number; posted: boolean }> {
  if (!Number.isInteger(input.targetMinor) || input.targetMinor < 0) {
    throw new RangeError("targetMinor must be a non-negative integer");
  }
  return withTxRetry(() =>
    db.transaction(async (tx) => {
      const account = await lockAccount(tx, input.accountId, input.userId);
      const previousMinor = account.balanceCacheMinor;
      const delta = input.targetMinor - previousMinor;
      if (delta === 0) {
        await tx
          .update(moneyAccounts)
          .set({ updatedAt: new Date() })
          .where(eq(moneyAccounts.id, account.id));
        return { previousMinor, balanceAfter: previousMinor, delta: 0, posted: false };
      }
      const [last] = await tx
        .select({ id: moneyLedger.id })
        .from(moneyLedger)
        .where(eq(moneyLedger.accountId, account.id))
        .orderBy(desc(moneyLedger.createdAt), desc(moneyLedger.id))
        .limit(1);
      const refId = input.refId({
        balanceMinor: previousMinor,
        lastLedgerId: last?.id ?? null,
      });
      const type: MoneyLedgerType = delta > 0 ? "DEPOSIT" : "SPEND";
      const prior = await findLedgerByRef(tx, input.userId, refId, type);
      if (prior) {
        if (prior.accountId !== account.id) {
          throw new Error("Money ledger ref belongs to another account");
        }
        return {
          previousMinor: prior.balanceAfter - prior.delta,
          balanceAfter: prior.balanceAfter,
          delta: prior.delta,
          posted: false,
        };
      }
      const { balanceAfter } = await appendLedgerRow(tx, account, {
        delta,
        type,
        refType: input.refType,
        refId,
      });
      return { previousMinor, balanceAfter, delta, posted: true };
    }),
  );
}

/**
 * Moves the whole balance of `sourceAccountId` into `targetAccountId` and
 * closes the source, in one transaction that locks both accounts in id order.
 * The two ledger rows share `refId`; a repeat with the same ref returns the
 * first result.
 */
export async function mergeAccountInto(
  db: Db,
  input: {
    userId: string;
    sourceAccountId: string;
    targetAccountId: string;
    refId: string;
    refType: string;
    /** Picks the target's expiry from both locked rows. */
    nextExpiresAt: (target: MoneyAccountRow, source: MoneyAccountRow) => Date | null;
  },
): Promise<{ target: MoneyAccountRow; transferredMinor: number; alreadyApplied: boolean }> {
  if (input.sourceAccountId === input.targetAccountId) {
    throw new RangeError("Cannot merge an account into itself");
  }
  return withTxRetry(() =>
    db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(moneyAccounts)
        .where(inArray(moneyAccounts.id, [input.sourceAccountId, input.targetAccountId]))
        .orderBy(asc(moneyAccounts.id))
        .for("update");
      const source = locked.find((a) => a.id === input.sourceAccountId);
      const target = locked.find((a) => a.id === input.targetAccountId);
      if (!source || !target || source.userId !== input.userId || target.userId !== input.userId) {
        throw new Error("Money account not found");
      }

      const prior = await findLedgerByRef(tx, input.userId, input.refId, "TRANSFER_OUT");
      if (prior) {
        return { target, transferredMinor: -prior.delta, alreadyApplied: true };
      }
      if (source.status === "CLOSED" || target.status === "CLOSED") {
        throw new Error("Money account closed");
      }
      const amount = source.balanceCacheMinor;
      if (amount <= 0) {
        throw new Error("Money account has nothing to merge");
      }

      await appendLedgerRow(tx, source, {
        delta: -amount,
        type: "TRANSFER_OUT",
        refType: input.refType,
        refId: input.refId,
      });
      await appendLedgerRow(tx, target, {
        delta: amount,
        type: "TRANSFER_IN",
        refType: input.refType,
        refId: input.refId,
      });
      const [closedSource] = await tx
        .update(moneyAccounts)
        .set({ status: "CLOSED", updatedAt: new Date() })
        .where(eq(moneyAccounts.id, source.id))
        .returning();
      const [patchedTarget] = await tx
        .update(moneyAccounts)
        .set({ expiresAt: input.nextExpiresAt(target, closedSource ?? source), updatedAt: new Date() })
        .where(eq(moneyAccounts.id, target.id))
        .returning();
      return { target: patchedTarget ?? target, transferredMinor: amount, alreadyApplied: false };
    }),
  );
}

export type AccountReconcileResult = {
  cachedMinor: number;
  ledgerSumMinor: number;
  lastBalanceAfter: number | null;
  entries: number;
  fixed: boolean;
};

/**
 * Compares one account's cache with SUM(delta) of its ledger. Accounts start at
 * 0, so the sum is the true balance. With `fix`, the account row is locked
 * first, so no ledger write can land between the sum and the cache write.
 * Returns null when the account is missing or not the user's.
 */
export async function reconcileAccountCache(
  db: Db,
  accountId: string,
  userId: string,
  opts: { fix: boolean },
): Promise<AccountReconcileResult | null> {
  const run = async (tx: Tx): Promise<AccountReconcileResult | null> => {
    const query = tx
      .select()
      .from(moneyAccounts)
      .where(and(eq(moneyAccounts.id, accountId), eq(moneyAccounts.userId, userId)));
    const [account] = opts.fix ? await query.for("update") : await query;
    if (!account) return null;
    const [agg] = await tx
      .select({
        sum: sql<number>`coalesce(sum(${moneyLedger.delta}), 0)::int`,
        entries: sql<number>`count(*)::int`,
      })
      .from(moneyLedger)
      .where(eq(moneyLedger.accountId, accountId));
    const [last] = await tx
      .select({ balanceAfter: moneyLedger.balanceAfter })
      .from(moneyLedger)
      .where(eq(moneyLedger.accountId, accountId))
      .orderBy(desc(moneyLedger.createdAt), desc(moneyLedger.id))
      .limit(1);
    const ledgerSumMinor = Number(agg?.sum ?? 0);
    const entries = Number(agg?.entries ?? 0);
    const drift = account.balanceCacheMinor !== ledgerSumMinor;
    let fixed = false;
    if (opts.fix && drift && entries > 0) {
      await tx
        .update(moneyAccounts)
        .set({ balanceCacheMinor: ledgerSumMinor, updatedAt: new Date() })
        .where(eq(moneyAccounts.id, accountId));
      fixed = true;
    }
    return {
      cachedMinor: account.balanceCacheMinor,
      ledgerSumMinor,
      lastBalanceAfter: last?.balanceAfter ?? null,
      entries,
      fixed,
    };
  };
  // Read-only runs use one snapshot; fixing relies on the account row lock.
  return withTxRetry(() =>
    db.transaction(run, opts.fix ? undefined : { isolationLevel: "repeatable read" }),
  );
}

/**
 * Delete a zero-balance money account that has no ledger rows.
 *
 * Every ledger write locks the account row first, so holding `FOR UPDATE` on
 * it here is enough: a deposit landing mid-cleanup either commits before the
 * lock (and the checks below see it) or waits and then finds no account.
 * Returns false when the row is missing, funded, or has ledger history.
 */
export async function deleteOrphanMoneyAccount(
  db: Db,
  id: string,
  userId: string,
): Promise<boolean> {
  return withTxRetry(() =>
    db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(moneyAccounts)
        .where(and(eq(moneyAccounts.id, id), eq(moneyAccounts.userId, userId)))
        .for("update");

      if (!account || account.balanceCacheMinor !== 0) return false;

      const [ledger] = await tx
        .select({ id: moneyLedger.id })
        .from(moneyLedger)
        .where(eq(moneyLedger.accountId, id))
        .limit(1);

      if (ledger) return false;

      const deleted = await tx
        .delete(moneyAccounts)
        .where(and(eq(moneyAccounts.id, id), eq(moneyAccounts.userId, userId)))
        .returning({ id: moneyAccounts.id });

      return deleted.length > 0;
    }),
  );
}

/**
 * Sweep zero-balance shells for a user in one statement. Only removes
 * accounts with no ledger rows; a concurrent deposit holds the account lock
 * and moves the balance off 0, so the re-checked row no longer matches.
 */
export async function purgeOrphanMoneyAccounts(
  db: Db,
  userId: string,
): Promise<number> {
  const deleted = await db
    .delete(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.userId, userId),
        eq(moneyAccounts.balanceCacheMinor, 0),
        sql`not exists (select 1 from ${moneyLedger} where ${moneyLedger.accountId} = ${moneyAccounts.id})`,
      ),
    )
    .returning({ id: moneyAccounts.id });
  return deleted.length;
}
