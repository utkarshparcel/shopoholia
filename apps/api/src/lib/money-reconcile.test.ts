import { describe, expect, it, vi } from "vitest";
import { reconcileMoneyAccounts, toWorkerReconcileDeps } from "./money-reconcile.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import type { FastifyBaseLogger } from "fastify";

function stubLog(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => stubLog(),
  } as unknown as FastifyBaseLogger;
}

describe("money-reconcile", () => {
  it("reports no mismatches when cache matches ledger", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919888000001");
    const account = await repos.createMoneyAccount({
      userId: user.id,
      kind: "GIFT_CARD",
      merchant: "Amazon",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: account.id,
      userId: user.id,
      delta: 5000,
      type: "DEPOSIT",
      refType: "test",
      refId: "topup-1",
    });

    const result = await reconcileMoneyAccounts(repos, stubLog(), { fix: true });
    expect(result.checked).toBe(1);
    expect(result.mismatched).toBe(0);
    expect(result.fixed).toBe(0);
  });

  /** An account whose cache starts at `driftMinor`, so cache = sum + drift. */
  async function driftedAccount(
    repos: ReturnType<typeof createMemoryRepositories>,
    userId: string,
    depositMinor: number,
    driftMinor: number,
    ref: string,
  ) {
    const account = await repos.createMoneyAccount({
      userId,
      kind: "STORE_CREDIT",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: driftMinor,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: account.id,
      userId,
      delta: depositMinor,
      type: "DEPOSIT",
      refType: "test",
      refId: ref,
    });
    return account;
  }

  it("heals balanceCacheMinor from the ledger sum", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919888000002");
    const account = await driftedAccount(repos, user.id, 2500, 7499, "topup-2");
    const drifted = await repos.findMoneyAccount(account.id, user.id);
    expect(drifted!.balanceCacheMinor).toBe(9999);

    const result = await reconcileMoneyAccounts(repos, stubLog(), { fix: true });
    expect(result.mismatched).toBe(1);
    expect(result.fixed).toBe(1);
    expect(result.mismatches[0]!.fixed).toBe(true);
    expect(result.mismatches[0]!.cachedMinor).toBe(9999);
    expect(result.mismatches[0]!.ledgerSumMinor).toBe(2500);

    const healed = await repos.findMoneyAccount(account.id, user.id);
    expect(healed!.balanceCacheMinor).toBe(2500);
  });

  it("without fix only reports", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919888000004");
    const account = await driftedAccount(repos, user.id, 2500, 100, "topup-4");
    const result = await reconcileMoneyAccounts(repos, stubLog(), { fix: false });
    expect(result.mismatched).toBe(1);
    expect(result.fixed).toBe(0);
    expect((await repos.findMoneyAccount(account.id, user.id))!.balanceCacheMinor).toBe(2600);
  });

  it("with userId checks and fixes only that user's accounts", async () => {
    const repos = createMemoryRepositories();
    const { user: me } = await repos.createUser("+919888000005");
    const { user: other } = await repos.createUser("+919888000006");
    await driftedAccount(repos, me.id, 1000, 5, "mine-1");
    const theirs = await driftedAccount(repos, other.id, 1000, 7, "theirs-1");
    const result = await reconcileMoneyAccounts(repos, stubLog(), { fix: true, userId: me.id });
    expect(result.checked).toBe(1);
    expect(result.mismatches.map((m) => m.userId)).toEqual([me.id]);
    expect((await repos.findMoneyAccount(theirs.id, other.id))!.balanceCacheMinor).toBe(1007);
  });

  it("pages through every account in the cross-user sweep", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919888000007");
    for (let i = 0; i < 3; i++) await driftedAccount(repos, user.id, 100, 1, `page-${i}`);
    const listAll = vi.spyOn(repos, "listAllMoneyAccounts");
    const result = await reconcileMoneyAccounts(repos, stubLog(), { fix: true });
    expect(result.checked).toBe(3);
    expect(result.fixed).toBe(3);
    expect(listAll).toHaveBeenCalledWith({ afterId: undefined, limit: 500 });
  });

  it("exposes listAllMoneyAccounts / fixMoneyAccountCache on the repos contract", async () => {
    const repos = createMemoryRepositories();
    expect(typeof repos.listAllMoneyAccounts).toBe("function");
    expect(typeof repos.fixMoneyAccountCache).toBe("function");
    expect(await repos.listAllMoneyAccounts()).toEqual([]);
  });

  it("adapts repos for worker-expiry ReconcileDeps (postgres-compatible heal path)", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919888000003");
    const account = await repos.createMoneyAccount({
      userId: user.id,
      kind: "CASH",
      merchant: "Refund",
      currency: "INR",
      balanceCacheMinor: 300,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: account.id,
      userId: user.id,
      delta: 1000,
      type: "REFUND",
      refType: "return",
      refId: "ret-1",
    });

    const deps = toWorkerReconcileDeps(repos);
    const accounts = await deps.listAllMoneyAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.balanceCacheMinor).toBe(1300);

    // The heal writes the locked ledger sum; the passed value is not trusted.
    await deps.fixMoneyAccountCache(account.id, user.id, 424242);

    expect((await repos.findMoneyAccount(account.id, user.id))!.balanceCacheMinor).toBe(1000);
  });
});
