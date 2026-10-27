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

function stubRepos(acc: MoneyAccountRecord): Repositories {
  let current = { ...acc };
  return {
    findMoneyAccount: async (id, userId) =>
      current.id === id && current.userId === userId ? current : null,
    fixMoneyAccountCache: async (id, userId, correctBalance) => {
      if (current.id !== id || current.userId !== userId) {
        throw new Error("Money account not found");
      }
      current = {
        ...current,
        balanceCacheMinor: correctBalance,
        updatedAt: new Date(),
      };
    },
    postMoneyLedger: async (input) => {
      const balanceAfter = current.balanceCacheMinor + input.delta;
      if (balanceAfter < 0) throw new Error("insufficient");
      current = {
        ...current,
        balanceCacheMinor: balanceAfter,
        updatedAt: new Date(),
      };
      return {
        id: "ledger-1",
        accountId: input.accountId,
        userId: input.userId,
        delta: input.delta,
        type: input.type,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        balanceAfter,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  } as unknown as Repositories;
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
  });
});
