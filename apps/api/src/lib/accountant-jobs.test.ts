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
  MONTHLY_DIGEST_EVENT,
  MONTHLY_DIGEST_JOB,
  monthlyDigestJobId,
  utcMonthKey,
} from "@worn/shared";
import {
  monthlyDigestPayloadFromSummary,
  scheduleAccountantMonthlyDigest,
} from "./accountant-jobs.js";
import { processMonthlyDigest, type NudgeRepos } from "./nudge-jobs.js";

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockRepos(opts: {
  consentFlags?: Record<string, unknown>;
  pushToken?: string | null;
  recentCount?: number;
} = {}): NudgeRepos & {
  recorded: Array<Record<string, unknown>>;
} {
  const recorded: Array<Record<string, unknown>> = [];
  return {
    recorded,
    async findUserById() {
      return {
        consentFlags: opts.consentFlags ?? {},
        pushToken: opts.pushToken ?? null,
      };
    },
    async recordPushEvent(input) {
      recorded.push(input);
      return { id: `evt-${recorded.length}` };
    },
    async updatePushEventStatus() {},
    async countRecentPushEvents() {
      return opts.recentCount ?? 0;
    },
  };
}

describe("WV08-MONTHLY-DIGEST", () => {
  const originalRedis = process.env.REDIS_URL;
  const originalNudgeRedis = process.env.NUDGE_REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.NUDGE_REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
    if (originalNudgeRedis) process.env.NUDGE_REDIS_URL = originalNudgeRedis;
    else delete process.env.NUDGE_REDIS_URL;
  });

  it("utcMonthKey + monthlyDigestJobId are stable for the month", () => {
    expect(utcMonthKey(NOON)).toBe("2026-08");
    expect(monthlyDigestJobId("u1", "2026-08")).toBe("monthly-digest:u1:2026-08");
  });

  it("monthlyDigestPayloadFromSummary maps accountant summary", () => {
    const payload = monthlyDigestPayloadFromSummary(
      "u1",
      {
        monthlySpendMinor: 48_000,
        costPerWearMinor: 650,
        monthLabel: "2026-08",
      },
      { now: NOON },
    );
    expect(payload).toEqual({
      userId: "u1",
      spendMinor: 48_000,
      avgCostPerWearMinor: 650,
      monthLabel: "2026-08",
      currency: undefined,
    });
  });

  it("scheduleAccountantMonthlyDigest publishes with month-keyed jobId", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const status = await scheduleAccountantMonthlyDigest(
      "u1",
      {
        monthlySpendMinor: 12_000,
        avgCostPerWearMinor: 400,
        monthLabel: "2026-08",
      },
      { now: NOON, delayMs: 100 },
    );
    expect(status).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      MONTHLY_DIGEST_JOB,
      expect.objectContaining({
        userId: "u1",
        spendMinor: 12_000,
        avgCostPerWearMinor: 400,
        monthLabel: "2026-08",
      }),
      expect.objectContaining({ jobId: "monthly-digest:u1:2026-08" }),
    );
    expect(queueMocks.close).toHaveBeenCalled();
  });

  it("scheduleAccountantMonthlyDigest skips without Redis", async () => {
    const status = await scheduleAccountantMonthlyDigest("u1", {
      monthlySpendMinor: 1000,
      avgCostPerWearMinor: 100,
    });
    expect(status).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it("processMonthlyDigest delivers spend + CPW with digest channel", async () => {
    const repos = mockRepos({ recentCount: 0 });
    const result = await processMonthlyDigest(
      {
        userId: "u1",
        spendMinor: 55_000,
        avgCostPerWearMinor: 900,
        monthLabel: "2026-08",
      },
      repos,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(repos.recorded[0]).toMatchObject({
      eventType: MONTHLY_DIGEST_EVENT,
      payload: expect.objectContaining({
        deepLink: "worn://accountant?month=2026-08",
        androidChannelId: "worn-digest",
        amountMinor: 55_000,
        monthLabel: "2026-08",
      }),
    });
    expect(String(repos.recorded[0]!.body)).toMatch(/cost-per-wear/i);
  });

  it("processMonthlyDigest caps at one per ~month", async () => {
    const repos = mockRepos({ recentCount: 1 });
    const result = await processMonthlyDigest(
      { userId: "u1", spendMinor: 10_000, avgCostPerWearMinor: 200 },
      repos,
      { now: NOON },
    );
    expect(result).toEqual({ status: "skipped" });
    expect(repos.recorded).toHaveLength(0);
  });
});
