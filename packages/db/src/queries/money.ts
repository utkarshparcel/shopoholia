import { and, desc, eq, sql } from "drizzle-orm";
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

/**
 * Serialized, double-spend-safe money ledger write.
 *
 * All balance mutations MUST go through this helper. It:
 *  - runs inside a SERIALIZABLE transaction,
 *  - takes a row lock (`FOR UPDATE`) on the account row and on the latest
 *    ledger row for the user,
 *  - computes balanceAfter from the locked account cache,
 *  - throws on a negative resulting balance (double-spend guard),
 *  - writes the ledger row and updates money_accounts.balanceCacheMinor.
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
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`,
    );

    const [account] = await tx
      .select()
      .from(moneyAccounts)
      .where(eq(moneyAccounts.id, input.accountId))
      .for("update");

    if (!account) {
      throw new Error("Money account not found");
    }

    if (account.userId !== input.userId) {
      throw new Error("Money account does not belong to user");
    }

    await tx
      .select({ id: moneyLedger.id })
      .from(moneyLedger)
      .where(eq(moneyLedger.userId, input.userId))
      .orderBy(desc(moneyLedger.createdAt))
      .limit(1)
      .for("update");

    const balanceAfter = computeBalanceAfter(
      account.balanceCacheMinor,
      input.delta,
    );

    await tx.insert(moneyLedger).values({
      accountId: input.accountId,
      userId: input.userId,
      delta: input.delta,
      type: input.type,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      balanceAfter,
    });

    await tx
      .update(moneyAccounts)
      .set({ balanceCacheMinor: balanceAfter, updatedAt: new Date() })
      .where(eq(moneyAccounts.id, input.accountId));

    return { balanceAfter };
  });
}

/**
 * Delete a zero-balance money account that has no ledger rows.
 * Used when concurrent credit.add races: the loser leaves an empty shell.
 *
 * Runs under SERIALIZABLE + FOR UPDATE so a deposit landing mid-cleanup
 * cannot be wiped. Returns false when the row is missing, funded, or has
 * ledger history.
 */
export async function deleteOrphanMoneyAccount(
  db: Db,
  id: string,
  userId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

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
      .limit(1)
      .for("update");

    if (ledger) return false;

    const deleted = await tx
      .delete(moneyAccounts)
      .where(and(eq(moneyAccounts.id, id), eq(moneyAccounts.userId, userId)))
      .returning({ id: moneyAccounts.id });

    return deleted.length > 0;
  });
}

/**
 * Sweep zero-balance shells for a user (GC after concurrent credit.add).
 * Only removes accounts with no ledger rows.
 */
export async function purgeOrphanMoneyAccounts(
  db: Db,
  userId: string,
): Promise<number> {
  const candidates = await db
    .select({ id: moneyAccounts.id })
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.userId, userId),
        eq(moneyAccounts.balanceCacheMinor, 0),
      ),
    );

  let removed = 0;
  for (const row of candidates) {
    if (await deleteOrphanMoneyAccount(db, row.id, userId)) {
      removed += 1;
    }
  }
  return removed;
}
