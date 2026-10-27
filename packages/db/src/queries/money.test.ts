import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client.js";
import { moneyAccounts, moneyLedger } from "../schema/money.js";
import { users } from "../schema/users.js";
import {
  MONEY_TX_MAX_ATTEMPTS,
  computeBalanceAfter,
  createAccountWithLedgerEntry,
  deleteOrphanMoneyAccount,
  getAccountBalance,
  isRetryableTxError,
  ledgerRefId,
  mergeAccountInto,
  postLedgerEntry,
  purgeOrphanMoneyAccounts,
  reconcileAccountCache,
  setAccountBalance,
  withTxRetry,
} from "./money.js";

const ACCOUNT_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_ID = "00000000-0000-0000-0000-0000000000b1";

/** In-memory Db double that exercises postLedgerEntry's full code path
 * (FOR UPDATE select, balanceAfter, account cache update) without needing a
 * live Postgres. */
function makeMockDb(initialBalance: number, opts?: { accountUserId?: string }) {
  let balance = initialBalance;
  const ledger: Array<{ delta: number; balanceAfter: number }> = [];
  const accountUserId = opts?.accountUserId ?? USER_ID;

  const selectFor = async (table: unknown) => {
    if (table === moneyAccounts) {
      return [
        {
          id: ACCOUNT_ID,
          userId: accountUserId,
          balanceCacheMinor: balance,
        },
      ];
    }
    return [];
  };

  const makeSelect = (table: unknown) => ({
    from: (t: unknown) => makeSelect(t),
    where: () => makeSelect(table),
    orderBy: () => makeSelect(table),
    limit: () => makeSelect(table),
    for: () => selectFor(table),
  });

  const tx = {
    execute: async () => {},
    select: () => makeSelect(undefined),
    insert: (_table: unknown) => ({
      values: (v: { delta: number; balanceAfter: number }) => {
        ledger.push(v);
        balance = v.balanceAfter;
        return Promise.resolve();
      },
    }),
    update: (_table: unknown) => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  };

  let lock: Promise<void> = Promise.resolve();
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      const prev = lock;
      let release!: () => void;
      const next = new Promise<void>((res) => {
        release = res;
      });
      lock = prev.then(() => next);
      await prev;
      try {
        return await fn(tx);
      } finally {
        release!();
      }
    },
  } as unknown as Db;

  return { db, ledger, getBalance: () => balance };
}

describe("computeBalanceAfter (double-spend guard)", () => {
  it("adds positive delta", () => {
    expect(computeBalanceAfter(100, 50)).toBe(150);
  });

  it("allows zero balance", () => {
    expect(computeBalanceAfter(0, 0)).toBe(0);
  });

  it("throws on negative resulting balance", () => {
    expect(() => computeBalanceAfter(100, -150)).toThrow(
      /Insufficient money balance/,
    );
  });
});

describe("postLedgerEntry", () => {
  it("writes a deposit and computes balanceAfter", async () => {
    const { db, getBalance } = makeMockDb(0);
    const res = await postLedgerEntry(db, {
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      delta: 500,
      type: "DEPOSIT",
    });
    expect(res.balanceAfter).toBe(500);
    expect(getBalance()).toBe(500);
  });

  it("throws when a spend would go negative (double-spend guard)", async () => {
    const { db } = makeMockDb(100);
    await expect(
      postLedgerEntry(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        delta: -150,
        type: "SPEND",
      }),
    ).rejects.toThrow(/Insufficient money balance/);
  });

  it("chains deposits and spends with correct running balance", async () => {
    const { db } = makeMockDb(0);
    expect(
      (await postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: 1000, type: "DEPOSIT" })).balanceAfter,
    ).toBe(1000);
    expect(
      (await postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: -400, type: "SPEND" })).balanceAfter,
    ).toBe(600);
    expect(
      (await postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: 50, type: "PURCHASE_REWARD" })).balanceAfter,
    ).toBe(650);
  });

  it("recomputes from the locked cache so a second overspend is rejected", async () => {
    const { db } = makeMockDb(0);
    await postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: 600, type: "DEPOSIT" });
    // First spend lands: 600 -> 200.
    expect(
      (await postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: -400, type: "SPEND" })).balanceAfter,
    ).toBe(200);
    // Second spend of 400 would drive the balance negative; the double-spend
    // guard (which reads the just-updated cache inside the row-locked tx)
    // rejects it rather than allowing a race to underflow.
    await expect(
      postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: -400, type: "SPEND" }),
    ).rejects.toThrow(/Insufficient money balance/);
  });

  it("concurrent overspends are serialized: only one of two competing spends succeeds", async () => {
    const { db } = makeMockDb(0);
    await postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: 1000, type: "DEPOSIT" });
    const results = await Promise.allSettled([
      postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: -800, type: "SPEND" }),
      postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: -800, type: "SPEND" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ balanceAfter: number }>[];
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/Insufficient money balance/);
    expect(fulfilled[0].value.balanceAfter).toBe(200);
  });

  it("rejects when the locked account belongs to a different user", async () => {
    const OTHER_USER = "00000000-0000-0000-0000-0000000000c1";
    const { db } = makeMockDb(500, { accountUserId: OTHER_USER });
    await expect(
      postLedgerEntry(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        delta: 100,
        type: "DEPOSIT",
      }),
    ).rejects.toThrow(/does not belong to user/);
  });

  it("rejects when the locked account row is missing", async () => {
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: async () => {},
          select: () => ({
            from: () => ({
              where: () => ({
                for: async () => [],
                orderBy: () => ({
                  limit: () => ({ for: async () => [] }),
                }),
              }),
            }),
          }),
          insert: () => ({ values: async () => {} }),
          update: () => ({ set: () => ({ where: async () => {} }) }),
        };
        return fn(tx);
      },
    } as unknown as Db;
    await expect(
      postLedgerEntry(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        delta: 100,
        type: "DEPOSIT",
      }),
    ).rejects.toThrow(/Money account not found/);
  });
});

describe("getAccountBalance read helper", () => {
  it("returns the cached balance via the helper", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ balanceCacheMinor: 42 }]),
          }),
        }),
      }),
    } as unknown as Db;
    expect(await getAccountBalance(db, ACCOUNT_ID)).toBe(42);
  });

  it("returns 0 when the account is missing", async () => {
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    } as unknown as Db;
    expect(await getAccountBalance(db, ACCOUNT_ID)).toBe(0);
  });
});

describe("deleteOrphanMoneyAccount / purgeOrphanMoneyAccounts", () => {
  function makeOrphanDb(opts: {
    balance: number;
    hasLedger: boolean;
    userId?: string;
  }) {
    const accountUserId = opts.userId ?? USER_ID;
    let deleted = false;
    const accounts = new Map<string, { id: string; userId: string; balanceCacheMinor: number }>([
      [
        ACCOUNT_ID,
        {
          id: ACCOUNT_ID,
          userId: accountUserId,
          balanceCacheMinor: opts.balance,
        },
      ],
    ]);
    const ledgerIds = opts.hasLedger ? ["ledger-1"] : [];

    const selectChain = (table: unknown) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.from = (t: unknown) => {
        (chain as { __table?: unknown }).__table = t;
        return chain;
      };
      const rowsFor = async () => {
        const t = (chain as { __table?: unknown }).__table ?? table;
        if (t === moneyAccounts) {
          const row = accounts.get(ACCOUNT_ID);
          return row && !deleted ? [row] : [];
        }
        if (t === moneyLedger) {
          return ledgerIds.map((id) => ({ id }));
        }
        return [];
      };
      chain.where = self;
      // `.limit()` is awaited directly for the ledger probe (no row lock).
      chain.limit = () => rowsFor();
      chain.for = rowsFor;
      // Non-tx select used by purgeOrphanMoneyAccounts
      chain.then = undefined;
      return {
        ...chain,
        // Make the chain thenable for `await db.select()...` style without for()
        [Symbol.toStringTag]: "OrphanSelect",
      };
    };

    // purge path: db.select().from().where() → Promise of rows
    const makeTopSelect = () => {
      let table: unknown;
      const api: {
        from: (t: unknown) => typeof api;
        where: () => Promise<Array<{ id: string }>>;
      } = {
        from: (t: unknown) => {
          table = t;
          return api;
        },
        where: async () => {
          if (table !== moneyAccounts || deleted) return [];
          const row = accounts.get(ACCOUNT_ID);
          if (!row || row.balanceCacheMinor !== 0) return [];
          return [{ id: row.id }];
        },
      };
      return api;
    };

    const tx = {
      execute: async () => {},
      select: (fields?: unknown) => {
        void fields;
        return selectChain(undefined);
      },
      delete: (_table: unknown) => ({
        where: () => ({
          returning: async () => {
            if (deleted) return [];
            const row = accounts.get(ACCOUNT_ID);
            if (!row || row.balanceCacheMinor !== 0 || ledgerIds.length > 0) {
              return [];
            }
            deleted = true;
            accounts.delete(ACCOUNT_ID);
            return [{ id: ACCOUNT_ID }];
          },
        }),
      }),
    };

    const db = {
      select: () => makeTopSelect(),
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as Db;

    return {
      db,
      wasDeleted: () => deleted,
    };
  }

  it("deletes a zero-balance shell with no ledger", async () => {
    const { db, wasDeleted } = makeOrphanDb({ balance: 0, hasLedger: false });
    await expect(deleteOrphanMoneyAccount(db, ACCOUNT_ID, USER_ID)).resolves.toBe(
      true,
    );
    expect(wasDeleted()).toBe(true);
  });

  it("refuses to delete a funded account", async () => {
    const { db, wasDeleted } = makeOrphanDb({ balance: 500, hasLedger: false });
    await expect(deleteOrphanMoneyAccount(db, ACCOUNT_ID, USER_ID)).resolves.toBe(
      false,
    );
    expect(wasDeleted()).toBe(false);
  });

  it("refuses to delete when ledger rows exist", async () => {
    const { db, wasDeleted } = makeOrphanDb({ balance: 0, hasLedger: true });
    await expect(deleteOrphanMoneyAccount(db, ACCOUNT_ID, USER_ID)).resolves.toBe(
      false,
    );
    expect(wasDeleted()).toBe(false);
  });

  it("purge sweeps zero-balance orphans for a user in one delete", async () => {
    let calls = 0;
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => {
            calls += 1;
            return [{ id: ACCOUNT_ID }];
          },
        }),
      }),
    } as unknown as Db;
    await expect(purgeOrphanMoneyAccounts(db, USER_ID)).resolves.toBe(1);
    expect(calls).toBe(1);
  });
});

describe("withTxRetry / isRetryableTxError", () => {
  const serialization = () => Object.assign(new Error("could not serialize access"), { code: "40001" });

  it("recognises 40001 and 40P01, also when wrapped in a cause", () => {
    expect(isRetryableTxError(serialization())).toBe(true);
    expect(isRetryableTxError({ code: "40P01" })).toBe(true);
    expect(isRetryableTxError(new Error("wrapped", { cause: serialization() }))).toBe(true);
    expect(isRetryableTxError(Object.assign(new Error("dup"), { code: "23505" }))).toBe(false);
    expect(isRetryableTxError(null)).toBe(false);
  });

  it("retries a serialization failure and returns the later result", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const result = await withTxRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw serialization();
        return "ok";
      },
      { sleep: async (ms) => void sleeps.push(ms), baseDelayMs: 10 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
    // Exponential with jitter: [10, 20) then [20, 40).
    expect(sleeps[0]).toBeGreaterThanOrEqual(10);
    expect(sleeps[0]).toBeLessThan(20);
    expect(sleeps[1]).toBeGreaterThanOrEqual(20);
    expect(sleeps[1]).toBeLessThan(40);
  });

  it("gives up after the bounded number of attempts", async () => {
    let calls = 0;
    await expect(
      withTxRetry(
        async () => {
          calls += 1;
          throw serialization();
        },
        { sleep: async () => {} },
      ),
    ).rejects.toMatchObject({ code: "40001" });
    expect(calls).toBe(MONEY_TX_MAX_ATTEMPTS);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(
      withTxRetry(async () => {
        calls += 1;
        throw new Error("Insufficient money balance");
      }),
    ).rejects.toThrow(/Insufficient/);
    expect(calls).toBe(1);
  });

  it("postLedgerEntry retries a transaction that aborts with 40001", async () => {
    const { db, getBalance } = makeMockDb(0);
    const realTx = (db as unknown as { transaction: (fn: unknown) => Promise<unknown> }).transaction;
    let attempts = 0;
    (db as unknown as { transaction: unknown }).transaction = async (fn: unknown) => {
      attempts += 1;
      if (attempts === 1) throw serialization();
      return realTx(fn);
    };
    const res = await postLedgerEntry(db, { accountId: ACCOUNT_ID, userId: USER_ID, delta: 300, type: "DEPOSIT" });
    expect(res.balanceAfter).toBe(300);
    expect(getBalance()).toBe(300);
    expect(attempts).toBe(2);
  });
});

describe("ledgerRefId", () => {
  it("is a stable RFC 4122 v5 uuid per input", () => {
    const a = ledgerRefId("credit.merge", "s", "t");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ledgerRefId("credit.merge", "s", "t")).toBe(a);
    expect(ledgerRefId("credit.merge", "t", "s")).not.toBe(a);
    expect(() => ledgerRefId()).toThrow(RangeError);
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL);

// Needs a migrated database (pnpm --filter @worn/db db:migrate). It seeds its own
// user and deletes only the rows it created.
describe.skipIf(!runIntegration)("postLedgerEntry (live DB, row-lock path)", () => {
  let db: Db;
  let userId: string;

  beforeAll(async () => {
    const { createDb } = await import("../client.js");
    db = createDb(DATABASE_URL!);
    const [user] = await db.insert(users).values({}).returning({ id: users.id });
    userId = user!.id;
  });

  afterAll(async () => {
    if (!db || !userId) return;
    await db.delete(moneyLedger).where(eq(moneyLedger.userId, userId));
    await db.delete(moneyAccounts).where(eq(moneyAccounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("persists a deposit and a guarded reject on overspend", async () => {
    const inserted = await db
      .insert(moneyAccounts)
      .values({
        userId,
        kind: "CASH",
        merchant: "worn",
        currency: "INR",
      })
      .returning({ id: moneyAccounts.id });
    const accountId = inserted[0]!.id;

    const dep = await postLedgerEntry(db, {
      accountId,
      userId,
      delta: 1000,
      type: "DEPOSIT",
    });
    expect(dep.balanceAfter).toBe(1000);
    expect(await getAccountBalance(db, accountId)).toBe(1000);

    await expect(
      postLedgerEntry(db, { accountId, userId, delta: -1500, type: "SPEND" }),
    ).rejects.toThrow(/Insufficient money balance/);

    const spend = await postLedgerEntry(db, {
      accountId,
      userId,
      delta: -400,
      type: "SPEND",
    });
    expect(spend.balanceAfter).toBe(600);
  });

  async function newAccount(): Promise<string> {
    const [row] = await db
      .insert(moneyAccounts)
      .values({ userId, kind: "GIFT_CARD", merchant: "Myntra", currency: "INR" })
      .returning({ id: moneyAccounts.id });
    return row!.id;
  }

  it("concurrent posts on different accounts all commit (no 40001 storm)", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => newAccount()));
    const results = await Promise.allSettled(
      ids.map((accountId) => postLedgerEntry(db, { accountId, userId, delta: 100, type: "DEPOSIT" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(6);
  });

  it("concurrent spends on one account: the row lock admits exactly the affordable ones", async () => {
    const accountId = await newAccount();
    await postLedgerEntry(db, { accountId, userId, delta: 1000, type: "DEPOSIT" });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => postLedgerEntry(db, { accountId, userId, delta: -300, type: "SPEND" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await getAccountBalance(db, accountId)).toBe(100);
  });

  it("createAccountWithLedgerEntry is atomic and idempotent per ref, also under a race", async () => {
    const refId = ledgerRefId("test.add", userId);
    const input = {
      account: { userId, kind: "GIFT_CARD" as const, merchant: "Ajio", currency: "INR", expiresAt: null, status: "ACTIVE" as const },
      entry: { delta: 2500, type: "DEPOSIT" as const, refType: "credit.add", refId },
    };
    const raced = await Promise.all([1, 2, 3].map(() => createAccountWithLedgerEntry(db, input)));
    const ids = new Set(raced.map((r) => r.account.id));
    expect(ids.size).toBe(1);
    expect(raced.filter((r) => r.created)).toHaveLength(1);
    const again = await createAccountWithLedgerEntry(db, input);
    expect(again).toMatchObject({ created: false, account: { id: [...ids][0], balanceCacheMinor: 2500 } });
    const shells = await db
      .select({ id: moneyAccounts.id })
      .from(moneyAccounts)
      .where(and(eq(moneyAccounts.userId, userId), eq(moneyAccounts.merchant, "Ajio")));
    expect(shells).toHaveLength(1);
  });

  it("createAccountWithLedgerEntry rejects a negative first entry without leaving a shell", async () => {
    await expect(
      createAccountWithLedgerEntry(db, {
        account: { userId, kind: "CASH", merchant: "Neg", currency: "INR", expiresAt: null, status: "ACTIVE" },
        entry: { delta: -1, type: "SPEND" },
      }),
    ).rejects.toThrow(/Insufficient/);
    const rows = await db.select().from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), eq(moneyAccounts.merchant, "Neg")));
    expect(rows).toHaveLength(0);
  });

  it("setAccountBalance posts the delta under the lock and is a no-op on repeat", async () => {
    const accountId = await newAccount();
    await postLedgerEntry(db, { accountId, userId, delta: 1000, type: "DEPOSIT" });
    const ref = ({ lastLedgerId }: { lastLedgerId: string | null }) =>
      ledgerRefId("test.set", accountId, lastLedgerId ?? "none", "700");
    const down = await setAccountBalance(db, { accountId, userId, targetMinor: 700, refType: "credit.balance_check", refId: ref });
    expect(down).toEqual({ previousMinor: 1000, balanceAfter: 700, delta: -300, posted: true });
    const repeat = await setAccountBalance(db, { accountId, userId, targetMinor: 700, refType: "credit.balance_check", refId: ref });
    expect(repeat).toEqual({ previousMinor: 700, balanceAfter: 700, delta: 0, posted: false });
    const up = await setAccountBalance(db, {
      accountId,
      userId,
      targetMinor: 900,
      refType: "credit.balance_check",
      refId: () => ledgerRefId("test.set.up", accountId),
    });
    expect(up).toMatchObject({ delta: 200, balanceAfter: 900, posted: true });
    // Two concurrent "set to 500" calls: one posts -400, the other sees 0.
    const both = await Promise.all(
      [1, 2].map(() =>
        setAccountBalance(db, {
          accountId,
          userId,
          targetMinor: 500,
          refType: "credit.balance_check",
          refId: ({ lastLedgerId }) => ledgerRefId("test.set.race", accountId, lastLedgerId ?? "none"),
        }),
      ),
    );
    expect(both.map((r) => r.delta).sort()).toEqual([-400, 0]);
    expect(await getAccountBalance(db, accountId)).toBe(500);
    await expect(
      setAccountBalance(db, { accountId, userId, targetMinor: -1, refType: "x", refId: () => ledgerRefId("x") }),
    ).rejects.toThrow(RangeError);
  });

  it("mergeAccountInto moves the whole balance in one tx and a retry is a no-op", async () => {
    const source = await newAccount();
    const target = await newAccount();
    await postLedgerEntry(db, { accountId: source, userId, delta: 400, type: "DEPOSIT" });
    await postLedgerEntry(db, { accountId: target, userId, delta: 100, type: "DEPOSIT" });
    const refId = ledgerRefId("credit.merge", source, target);
    const input = {
      userId,
      sourceAccountId: source,
      targetAccountId: target,
      refId,
      refType: "credit.merge",
      nextExpiresAt: () => null,
    };
    const [a, b] = await Promise.all([mergeAccountInto(db, input), mergeAccountInto(db, input)]);
    expect([a.alreadyApplied, b.alreadyApplied].sort()).toEqual([false, true]);
    expect(a.transferredMinor).toBe(400);
    expect(b.transferredMinor).toBe(400);
    expect(await getAccountBalance(db, target)).toBe(500);
    expect(await getAccountBalance(db, source)).toBe(0);
    const [closed] = await db.select().from(moneyAccounts).where(eq(moneyAccounts.id, source));
    expect(closed!.status).toBe("CLOSED");
    await expect(
      mergeAccountInto(db, { ...input, refId: ledgerRefId("other") }),
    ).rejects.toThrow(/closed/);
    await expect(mergeAccountInto(db, { ...input, targetAccountId: source })).rejects.toThrow(RangeError);
  });

  it("reconcileAccountCache reports drift read-only and heals it under the lock", async () => {
    const accountId = await newAccount();
    await postLedgerEntry(db, { accountId, userId, delta: 800, type: "DEPOSIT" });
    await db.update(moneyAccounts).set({ balanceCacheMinor: 9999 }).where(eq(moneyAccounts.id, accountId));
    const report = await reconcileAccountCache(db, accountId, userId, { fix: false });
    expect(report).toEqual({ cachedMinor: 9999, ledgerSumMinor: 800, lastBalanceAfter: 800, entries: 1, fixed: false });
    expect(await getAccountBalance(db, accountId)).toBe(9999);
    const healed = await reconcileAccountCache(db, accountId, userId, { fix: true });
    expect(healed).toMatchObject({ fixed: true, ledgerSumMinor: 800 });
    expect(await getAccountBalance(db, accountId)).toBe(800);
    expect(await reconcileAccountCache(db, accountId, "00000000-0000-0000-0000-00000000ffff", { fix: true })).toBeNull();
  });

  it("purgeOrphanMoneyAccounts deletes only empty, ledger-free shells", async () => {
    const empty = await newAccount();
    const funded = await newAccount();
    await postLedgerEntry(db, { accountId: funded, userId, delta: 10, type: "DEPOSIT" });
    expect(await deleteOrphanMoneyAccount(db, funded, userId)).toBe(false);
    const removed = await purgeOrphanMoneyAccounts(db, userId);
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await db.select({ id: moneyAccounts.id }).from(moneyAccounts).where(eq(moneyAccounts.id, empty));
    expect(left).toHaveLength(0);
    const kept = await db.select({ id: moneyAccounts.id }).from(moneyAccounts).where(eq(moneyAccounts.id, funded));
    expect(kept).toHaveLength(1);
  });
});
