import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client.js";
import { moneyAccounts, moneyLedger } from "../schema/money.js";
import { users } from "../schema/users.js";
import {
  computeBalanceAfter,
  deleteOrphanMoneyAccount,
  getAccountBalance,
  postLedgerEntry,
  purgeOrphanMoneyAccounts,
} from "./money.js";

const ACCOUNT_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_ID = "00000000-0000-0000-0000-0000000000b1";

/** In-memory Db double that exercises postLedgerEntry's full code path
 * (serializable execute, FOR UPDATE selects, balanceAfter, account cache
 * update) without needing a live Postgres. */
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
      chain.where = self;
      chain.limit = self;
      chain.for = async () => {
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

  it("purge sweeps zero-balance orphans for a user", async () => {
    const { db, wasDeleted } = makeOrphanDb({ balance: 0, hasLedger: false });
    await expect(purgeOrphanMoneyAccounts(db, USER_ID)).resolves.toBe(1);
    expect(wasDeleted()).toBe(true);
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
});
