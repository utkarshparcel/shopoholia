import { desc, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { coinLedger } from "../schema/coin-ledger.js";
import { users } from "../schema/users.js";

export type CoinLedgerType =
  | "GRANT"
  | "IAP_PURCHASE"
  | "SPEND_ORDER"
  | "SPEND_UNLOCK"
  | "SPEND_RUSH"
  | "EARN_STREAK"
  | "EARN_SHARE"
  | "EARN_OPTIN"
  | "REFUND";

export async function getCoinBalance(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ balanceAfter: coinLedger.balanceAfter })
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId))
    .orderBy(desc(coinLedger.createdAt))
    .limit(1);

  if (row) return row.balanceAfter;

  const [user] = await db
    .select({ coinBalanceCache: users.coinBalanceCache })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.coinBalanceCache ?? 0;
}

export async function grantCoins(
  db: Db,
  input: {
    userId: string;
    delta: number;
    type: CoinLedgerType;
    refType?: string;
    refId?: string;
  },
): Promise<{ balanceAfter: number }> {
  const current = await getCoinBalance(db, input.userId);
  const balanceAfter = current + input.delta;

  if (balanceAfter < 0) {
    throw new Error("Insufficient coin balance");
  }

  await db.insert(coinLedger).values({
    userId: input.userId,
    delta: input.delta,
    type: input.type,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    balanceAfter,
  });

  await db
    .update(users)
    .set({ coinBalanceCache: balanceAfter, updatedAt: new Date() })
    .where(eq(users.id, input.userId));

  return { balanceAfter };
}
