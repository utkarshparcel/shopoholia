import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({ id: "job-1" })),
  close: vi.fn(async () => undefined),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      return queueMocks.add(...args);
    }
    close() {
      return queueMocks.close();
    }
  },
}));

import {
  EMI_DUE_JOB,
  EMI_QUEUE,
  computeEmiNudgeDelayMs,
  emiDueJobId,
  scheduleEmiDueNudge,
} from "./emi-jobs.js";

describe("scheduleEmiDueNudge", () => {
  const prevRedis = process.env.REDIS_URL;

  beforeEach(() => {
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
  });

  it("publishes with stable jobId and delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
    try {
      const dueOn = "2099-01-15";
      const result = await scheduleEmiDueNudge({
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        userId: "u1",
        provider: "LazyPay",
        merchant: "Ajio",
        remainingMinor: 50_000,
        installmentMinor: 10_000,
        nextDueOn: dueOn,
        currency: "INR",
        status: "ACTIVE",
      });
      expect(result).toBe("published");
      expect(queueMocks.add).toHaveBeenCalledWith(
        EMI_DUE_JOB,
        expect.objectContaining({ planId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", dueOn }),
        expect.objectContaining({
          jobId: emiDueJobId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", dueOn),
          delay: computeEmiNudgeDelayMs(dueOn),
        }),
      );
      expect(queueMocks.close).toHaveBeenCalled();
      expect(EMI_QUEUE).toBe("emi-due");
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips paid plans", async () => {
    const result = await scheduleEmiDueNudge({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      userId: "u1",
      provider: "Simpl",
      merchant: null,
      remainingMinor: 0,
      installmentMinor: 1000,
      nextDueOn: "2099-01-01",
      currency: "INR",
      status: "PAID",
    });
    expect(result).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
  });
});
