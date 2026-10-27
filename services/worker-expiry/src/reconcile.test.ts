import { describe, expect, it } from "vitest";
import { reconcileMoneyAccountsWorker } from "./reconcile.js";

describe("worker-expiry money reconcile", () => {
  it("heals cache drift via fixMoneyAccountCache (postgres-shaped deps)", async () => {
    const accounts = [
      {
        id: "acc-1",
        userId: "user-1",
        merchant: "Amazon",
        balanceCacheMinor: 999,
        createdAt: new Date(),
      },
    ];
    const ledger = [
      {
        accountId: "acc-1",
        userId: "user-1",
        delta: 500,
        balanceAfter: 500,
        createdAt: new Date(),
      },
    ];
    let fixedTo: number | null = null;

    const result = await reconcileMoneyAccountsWorker(
      {
        listAllMoneyAccounts: async () => accounts,
        listMoneyLedger: async () => ledger,
        fixMoneyAccountCache: async (_id, _uid, bal) => {
          fixedTo = bal;
        },
      },
      { fix: true },
    );

    expect(result.checked).toBe(1);
    expect(result.mismatched).toBe(1);
    expect(result.fixed).toBe(1);
    expect(fixedTo).toBe(500);
  });

  it("reports unfixed when fixMoneyAccountCache throws and invokes logWarn", async () => {
    const warnings: Array<{ meta: Record<string, unknown>; msg: string }> = [];
    const result = await reconcileMoneyAccountsWorker(
      {
        listAllMoneyAccounts: async () => [
          {
            id: "acc-2",
            userId: "user-2",
            merchant: "Flipkart",
            balanceCacheMinor: 100,
            createdAt: new Date(),
          },
        ],
        listMoneyLedger: async () => [
          {
            accountId: "acc-2",
            userId: "user-2",
            delta: 50,
            balanceAfter: 50,
            createdAt: new Date(),
          },
        ],
        fixMoneyAccountCache: async () => {
          throw new Error("lock timeout");
        },
        logWarn: (meta, msg) => warnings.push({ meta, msg }),
      },
      { fix: true },
    );

    expect(result.fixed).toBe(0);
    expect(result.mismatched).toBe(1);
    expect(result.mismatches[0]!.fixed).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.msg).toBe("money.reconcile.mismatch");
  });

  it("skips accounts with empty ledger and can run without fix", async () => {
    const result = await reconcileMoneyAccountsWorker(
      {
        listAllMoneyAccounts: async () => [
          {
            id: "acc-3",
            userId: "user-3",
            merchant: "Myntra",
            balanceCacheMinor: 0,
            createdAt: new Date(),
          },
        ],
        listMoneyLedger: async () => [],
        fixMoneyAccountCache: async () => {
          throw new Error("should not run");
        },
      },
      { fix: false },
    );
    expect(result).toEqual({
      checked: 1,
      mismatched: 0,
      fixed: 0,
      mismatches: [],
    });
  });
});
