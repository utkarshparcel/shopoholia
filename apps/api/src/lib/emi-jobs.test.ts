import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async (): Promise<unknown> => ({ id: "job-1" })),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      return (queueMocks.add as (...a: unknown[]) => Promise<unknown>)(...args);
    }
    on() {
      return this;
    }
    close() {
      return Promise.resolve();
    }
  },
}));

import {
  EMI_DUE_JOB,
  EMI_QUEUE,
  computeEmiNudgeDelayMs,
  emiDueJobId,
  processEmiDueNudge,
  scheduleEmiDueNudge,
  type EmiDuePayload,
} from "./emi-jobs.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

const PLAN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("scheduleEmiDueNudge", () => {
  const prevRedis = process.env.REDIS_URL;

  beforeEach(() => {
    queueMocks.add.mockReset();
    queueMocks.add.mockImplementation(async () => ({ id: "job-1" }));
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
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
        id: PLAN_ID,
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
        expect.objectContaining({ planId: PLAN_ID, dueOn }),
        expect.objectContaining({
          jobId: jobIdFrom(emiDueJobId(PLAN_ID, dueOn)),
          delay: computeEmiNudgeDelayMs(dueOn),
        }),
      );
      const [, , opts] = queueMocks.add.mock.calls[0] as unknown as [string, unknown, { jobId: string }];
      expect(opts.jobId).not.toContain(":");
      expect(EMI_QUEUE).toBe("emi-due");
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws QueueUnavailableError when Redis can't take the job", async () => {
    queueMocks.add.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      scheduleEmiDueNudge({
        id: PLAN_ID,
        userId: "u1",
        provider: "LazyPay",
        merchant: null,
        remainingMinor: 50_000,
        installmentMinor: 10_000,
        nextDueOn: "2099-01-15",
        currency: "INR",
        status: "ACTIVE",
      }),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });

  it("skips paid plans", async () => {
    const result = await scheduleEmiDueNudge({
      id: PLAN_ID,
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

describe("processEmiDueNudge", () => {
  const payload: EmiDuePayload = {
    planId: PLAN_ID,
    userId: "u1",
    provider: "LazyPay",
    merchant: "Ajio",
    remainingMinor: 50_000,
    installmentMinor: 10_000,
    dueOn: "2099-01-15",
    currency: "INR",
  };
  // Midday IST: outside default quiet hours.
  const now = new Date("2099-01-12T06:30:00.000Z");

  function makeRepos(plan: { status: string; remainingMinor: number; nextDueOn: string } | null) {
    const rows = new Map<string, { id: string; status: "QUEUED" | "SENT" | "FAILED" }>();
    return {
      rows,
      repos: {
        findEmiPlan: vi.fn(async () => (plan ? { id: PLAN_ID, userId: "u1", ...plan } : null)),
        findUserById: vi.fn(async () => ({
          id: "u1",
          prefs: {},
          timeZone: "Asia/Kolkata",
          pushToken: "ExponentPushToken[abc]",
        })),
        // Mirrors the repo: one row per dedupe key, returned as stored.
        recordPushEvent: vi.fn(async (input: { dedupeKey: string }) => {
          const existing = rows.get(input.dedupeKey);
          if (existing) return existing;
          const row = { id: `pe-${rows.size + 1}`, status: "QUEUED" as const };
          rows.set(input.dedupeKey, row);
          return row;
        }),
        updatePushEventStatus: vi.fn(async (id: string, status: "SENT" | "FAILED") => {
          for (const row of rows.values()) if (row.id === id) row.status = status;
        }),
      },
    };
  }

  it("sends once when run twice", async () => {
    const { repos } = makeRepos({ status: "ACTIVE", remainingMinor: 50_000, nextDueOn: "2099-01-15" });
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t1" }));
    const first = await processEmiDueNudge(payload, repos as never, { now, sendExpo });
    const second = await processEmiDueNudge(payload, repos as never, { now, sendExpo });
    expect(first.status).toBe("sent");
    expect(second.status).toBe("skipped");
    expect(sendExpo).toHaveBeenCalledTimes(1);
  });

  it("skips when the plan moved to another due date or was paid", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t1" }));
    const moved = makeRepos({ status: "ACTIVE", remainingMinor: 40_000, nextDueOn: "2099-02-15" });
    expect((await processEmiDueNudge(payload, moved.repos as never, { now, sendExpo })).status).toBe(
      "skipped",
    );
    const paid = makeRepos({ status: "PAID", remainingMinor: 0, nextDueOn: "2099-01-15" });
    expect((await processEmiDueNudge(payload, paid.repos as never, { now, sendExpo })).status).toBe(
      "skipped",
    );
    const gone = makeRepos(null);
    expect((await processEmiDueNudge(payload, gone.repos as never, { now, sendExpo })).status).toBe(
      "skipped",
    );
    expect(sendExpo).not.toHaveBeenCalled();
  });
});
