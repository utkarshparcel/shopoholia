import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BALANCE_RECHECK_INTERVAL_MS,
  needsBalanceRecheckReminder,
} from "@worn/shared";
import {
  balanceCheckMetaForAccount,
  confirmManualBalance,
  fetchMerchantBalance,
  runBalanceCheck,
} from "./balance-check.js";
import type { MoneyAccountRecord, Repositories } from "./repositories/types.js";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({})),
  close: vi.fn(async () => {}),
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    add(...args: unknown[]) {
      return queueMocks.add(...args);
    }
    close() {
      return queueMocks.close();
    }
  },
}));

function account(
  overrides: Partial<MoneyAccountRecord> = {},
): MoneyAccountRecord {
  const now = new Date("2026-07-01T00:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000099",
    kind: "GIFT_CARD",
    merchant: "Myntra",
    currency: "INR",
    balanceCacheMinor: 5000,
    expiresAt: null,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function stubRepos(acc: MoneyAccountRecord) {
  let current = { ...acc };
  const posted: Array<{ refId: string; delta: number; balanceAfter: number }> = [];
  const repos = {
    findMoneyAccount: async (id: string, userId: string) =>
      current.id === id && current.userId === userId ? current : null,
    setMoneyAccountBalance: async (input: {
      accountId: string;
      userId: string;
      targetMinor: number;
      refType: string;
      refId: (state: { balanceMinor: number; lastLedgerId: string | null }) => string;
    }) => {
      if (current.id !== input.accountId || current.userId !== input.userId) {
        throw new Error("Money account not found");
      }
      const previousMinor = current.balanceCacheMinor;
      const delta = input.targetMinor - previousMinor;
      current = { ...current, updatedAt: new Date() };
      if (delta === 0) {
        return { previousMinor, balanceAfter: previousMinor, delta: 0, posted: false };
      }
      const refId = input.refId({
        balanceMinor: previousMinor,
        lastLedgerId: posted.length ? `ledger-${posted.length}` : null,
      });
      const prior = posted.find((p) => p.refId === refId);
      if (prior) {
        return {
          previousMinor: prior.balanceAfter - prior.delta,
          balanceAfter: prior.balanceAfter,
          delta: prior.delta,
          posted: false,
        };
      }
      posted.push({ refId, delta, balanceAfter: input.targetMinor });
      current = { ...current, balanceCacheMinor: input.targetMinor };
      return { previousMinor, balanceAfter: input.targetMinor, delta, posted: true };
    },
  };
  return Object.assign(repos as unknown as Repositories, {
    posted,
    current: () => current,
  });
}

describe("fetchMerchantBalance", () => {
  it("uses stub when no MERCHANT_BALANCE_API_URL", async () => {
    const r = await fetchMerchantBalance({
      merchant: "Amazon",
      currency: "INR",
      hintBalanceMinor: 1200,
      env: {},
    });
    expect(r).toEqual({ balanceMinor: 1200, source: "stub" });
  });

  it("calls hosted API when URL is set", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ balanceMinor: 3400 }),
    })) as unknown as typeof fetch;
    const r = await fetchMerchantBalance({
      merchant: "Amazon",
      currency: "INR",
      hintBalanceMinor: 1200,
      env: { MERCHANT_BALANCE_API_URL: "https://balance.example/check" },
      fetchImpl,
    });
    expect(r).toEqual({ balanceMinor: 3400, source: "api" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives up on a hung merchant API after the timeout", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason),
        );
      })) as unknown as typeof fetch;
    await expect(
      fetchMerchantBalance({
        merchant: "Amazon",
        currency: "INR",
        hintBalanceMinor: 1200,
        env: { MERCHANT_BALANCE_API_URL: "https://balance.example/check" },
        fetchImpl,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("rejects a non-finite merchant balance", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ balanceMinor: Number.POSITIVE_INFINITY }),
    })) as unknown as typeof fetch;
    await expect(
      fetchMerchantBalance({
        merchant: "Amazon",
        currency: "INR",
        hintBalanceMinor: 1200,
        env: { MERCHANT_BALANCE_API_URL: "https://balance.example/check" },
        fetchImpl,
      }),
    ).rejects.toThrow(/invalid balanceMinor/);
  });
});

describe("runBalanceCheck", () => {
  beforeEach(() => {
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    process.env.REDIS_URL = "redis://localhost:6379";
  });
  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("refreshes balance for api-capable merchants via stub", async () => {
    const acc = account({ merchant: "Amazon.in", balanceCacheMinor: 1000 });
    const repos = stubRepos(acc);
    const result = await runBalanceCheck(repos, acc, {
      stubBalanceMinor: 2500,
      env: {},
    });
    expect(result.mode).toBe("api");
    expect(result.refreshed).toBe(true);
    expect(result.balanceMinor).toBe(2500);
    expect(result.previousBalanceMinor).toBe(1000);
    expect(queueMocks.add).toHaveBeenCalled();
  });

  it("returns manual path and schedules reminder when no API", async () => {
    const acc = account({ merchant: "Corner Boutique" });
    const repos = stubRepos(acc);
    const result = await runBalanceCheck(repos, acc, { env: {} });
    expect(result.mode).toBe("manual");
    expect(result.refreshed).toBe(false);
    expect(result.balanceMinor).toBe(5000);
    expect(result.message).toMatch(/No balance API/);
    expect(queueMocks.add).toHaveBeenCalled();
  });
});

describe("confirmManualBalance + reminder helpers", () => {
  beforeEach(() => {
    queueMocks.add.mockClear();
    process.env.REDIS_URL = "redis://localhost:6379";
  });
  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("adjusts down and marks reminder due from meta", async () => {
    const acc = account({ balanceCacheMinor: 5000 });
    const repos = stubRepos(acc);
    const applied = await confirmManualBalance(repos, acc, 3000);
    expect(applied.adjusted).toBe(true);
    expect(applied.balanceMinor).toBe(3000);

    const meta = balanceCheckMetaForAccount(acc, {
      now: new Date(acc.updatedAt.getTime() + BALANCE_RECHECK_INTERVAL_MS + 1),
    });
    expect(meta.balanceCheck.due).toBe(true);
    expect(needsBalanceRecheckReminder(acc.updatedAt, {
      now: new Date(acc.updatedAt.getTime() + BALANCE_RECHECK_INTERVAL_MS + 1),
    })).toBe(true);
  });

  it("no-ops ledger when balance unchanged but touches cache", async () => {
    const acc = account({ balanceCacheMinor: 5000 });
    const repos = stubRepos(acc);
    const applied = await confirmManualBalance(repos, acc, 5000);
    expect(applied.adjusted).toBe(false);
    expect(applied.balanceMinor).toBe(5000);
    expect(repos.posted).toHaveLength(0);
  });

  it("computes the delta from the locked balance, not the caller's copy", async () => {
    const acc = account({ balanceCacheMinor: 5000 });
    const repos = stubRepos(acc);
    await confirmManualBalance(repos, acc, 4000);
    // `acc` is now stale (5000); the second confirm must not re-apply -1000.
    const again = await confirmManualBalance(repos, acc, 3000);
    expect(again.balanceMinor).toBe(3000);
    expect(repos.posted.map((p) => p.delta)).toEqual([-1000, -1000]);
  });

  it("replays a client idempotency key without posting twice", async () => {
    const acc = account({ balanceCacheMinor: 5000 });
    const repos = stubRepos(acc);
    const key = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
    const first = await confirmManualBalance(repos, acc, 2000, { idempotencyKey: key });
    expect(first).toEqual({ balanceMinor: 2000, adjusted: true });
    const replay = await confirmManualBalance(repos, acc, 2000, { idempotencyKey: key });
    expect(replay.balanceMinor).toBe(2000);
    expect(repos.posted).toHaveLength(1);
    expect(repos.posted[0]!.refId).toBe(key);
  });

  it("derives a stable ref for api refreshes so a retry posts once", async () => {
    const acc = account({ merchant: "Amazon.in", balanceCacheMinor: 1000 });
    const repos = stubRepos(acc);
    await runBalanceCheck(repos, acc, { stubBalanceMinor: 2500, env: {} });
    await runBalanceCheck(repos, acc, { stubBalanceMinor: 2500, env: {} });
    expect(repos.posted).toHaveLength(1);
    expect(repos.posted[0]!.refId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
