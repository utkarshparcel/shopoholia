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

  it("heals balanceCacheMinor from ledger via fixMoneyAccountCache", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919888000002");
    const account = await repos.createMoneyAccount({
      userId: user.id,
      kind: "STORE_CREDIT",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: account.id,
      userId: user.id,
      delta: 2500,
      type: "DEPOSIT",
      refType: "test",
      refId: "topup-2",
    });

    // Simulate denormalized cache drift
    await repos.fixMoneyAccountCache(account.id, user.id, 9999);
    const drifted = await repos.findMoneyAccount(account.id, user.id);
    expect(drifted!.balanceCacheMinor).toBe(9999);

    const result = await reconcileMoneyAccounts(repos, stubLog(), { fix: true });
    expect(result.mismatched).toBe(1);
    expect(result.fixed).toBe(1);
    expect(result.mismatches[0]!.fixed).toBe(true);

    const healed = await repos.findMoneyAccount(account.id, user.id);
    expect(healed!.balanceCacheMinor).toBe(2500);
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
      balanceCacheMinor: 0,
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
    await repos.fixMoneyAccountCache(account.id, user.id, 0);

    const deps = toWorkerReconcileDeps(repos);
    const accounts = await deps.listAllMoneyAccounts();
    expect(accounts).toHaveLength(1);

    const ledger = await deps.listMoneyLedger(account.id, user.id);
    const last = [...ledger].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    await deps.fixMoneyAccountCache(account.id, user.id, last.balanceAfter);

    expect((await repos.findMoneyAccount(account.id, user.id))!.balanceCacheMinor).toBe(1000);
  });
});
