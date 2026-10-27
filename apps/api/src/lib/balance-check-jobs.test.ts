import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({})),
  close: vi.fn(async () => {}),
  failAdd: false,
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    add(...args: unknown[]) {
      if (queueMocks.failAdd) return Promise.reject(new Error("enqueue failed"));
      return queueMocks.add(...args);
    }
    close() {
      return queueMocks.close();
    }
  },
}));

import {
  BALANCE_RECHECK_EVENT,
  BALANCE_RECHECK_JOB,
  BALANCE_RECHECK_QUEUE,
  processBalanceRecheckReminder,
  scheduleBalanceRecheckReminder,
} from "./balance-check-jobs.js";

describe("balance-check-jobs reminder", () => {
  beforeEach(() => {
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
    process.env.REDIS_URL = "redis://localhost:6379";
  });
  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("registers queue + job names", () => {
    expect(BALANCE_RECHECK_QUEUE).toBe("credit-balance-recheck");
    expect(BALANCE_RECHECK_JOB).toBe("credit-balance-recheck-reminder");
    expect(BALANCE_RECHECK_EVENT).toBe("CREDIT_BALANCE_RECHECK");
  });

  it("publishes delayed re-check reminder", async () => {
    const result = await scheduleBalanceRecheckReminder({
      id: "acc-1",
      userId: "user-1",
      merchant: "Myntra",
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      status: "ACTIVE",
      kind: "GIFT_CARD",
    });
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      BALANCE_RECHECK_JOB,
      expect.objectContaining({
        accountId: "acc-1",
        merchant: "Myntra",
      }),
      expect.objectContaining({
        jobId: "credit-balance-recheck:acc-1",
      }),
    );
  });

  it("skips when redis missing or account closed", async () => {
    delete process.env.REDIS_URL;
    expect(
      await scheduleBalanceRecheckReminder({
        id: "acc-1",
        userId: "user-1",
        merchant: "Myntra",
        updatedAt: new Date(),
        status: "ACTIVE",
        kind: "GIFT_CARD",
      }),
    ).toBe("skipped");

    process.env.REDIS_URL = "redis://localhost:6379";
    expect(
      await scheduleBalanceRecheckReminder({
        id: "acc-1",
        userId: "user-1",
        merchant: "Myntra",
        updatedAt: new Date(),
        status: "CLOSED",
        kind: "GIFT_CARD",
      }),
    ).toBe("skipped");
  });

  it("processBalanceRecheckReminder queues a push event", async () => {
    const recordPushEvent = vi.fn(async (input: Record<string, unknown>) => ({
      id: "push-1",
      ...input,
    }));
    const result = await processBalanceRecheckReminder(
      {
        accountId: "acc-1",
        userId: "user-1",
        merchant: "Myntra",
        lastCheckedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        findMoneyAccount: async () =>
          ({
            id: "acc-1",
            userId: "user-1",
            status: "ACTIVE",
            merchant: "Myntra",
          }) as never,
        findUserById: async () => ({
          consentFlags: { push: true, credits: true },
          pushToken: null,
        }),
        recordPushEvent: recordPushEvent as never,
        updatePushEventStatus: vi.fn(),
      },
      // Midday UTC: outside the default 22:00-07:00 UTC quiet hours.
      { now: new Date("2026-07-02T12:00:00.000Z") },
    );
    expect(result).toBeTruthy();
    expect(recordPushEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BALANCE_RECHECK_EVENT,
        dedupeKey: expect.stringContaining("credit-balance-recheck:acc-1"),
      }),
    );
  });
});
