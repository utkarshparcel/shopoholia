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
    on() {
      return this;
    }
    close() {
      return queueMocks.close();
    }
  },
}));

import {
  CREDIT_LEAD_MS,
  WARRANTY_LEAD_MS,
  computeExpiryDelayMs,
  computeSnoozeDelayMs,
  creditExpiryJobId,
  scheduleExpiryReminder,
  scheduleWarrantyReminder,
  snoozeWarrantyReminder,
  snoozeCreditReminder,
  CREDIT_SNOOZE_DEFAULT_MS,
  warrantyExpiryJobId,
} from "./expiry.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

const REDIS = "redis://127.0.0.1:63807";

function jobIdOf(call: number): string {
  return (queueMocks.add.mock.calls[call]![2] as { jobId: string }).jobId;
}

describe("expiry jobId + lead-time helpers", () => {
  it("stable credit jobId", () => {
    expect(creditExpiryJobId("acc-1")).toBe("credit-expiry:acc-1");
  });

  it("stable warranty jobId", () => {
    expect(warrantyExpiryJobId("w-1")).toBe("warranty-expiry:w-1");
  });

  it("credit fires at expiresAt - 7d", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const expiresAt = new Date(now + 30 * 86_400_000);
    const delay = computeExpiryDelayMs(expiresAt, CREDIT_LEAD_MS, now);
    expect(delay).toBe(30 * 86_400_000 - CREDIT_LEAD_MS);
    expect(now + delay!).toBeLessThan(expiresAt.getTime());
  });

  it("warranty fires at coverageUntil - 14d", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const coverageUntil = new Date(now + 30 * 86_400_000);
    const delay = computeExpiryDelayMs(coverageUntil, WARRANTY_LEAD_MS, now);
    expect(delay).toBe(30 * 86_400_000 - WARRANTY_LEAD_MS);
  });

  it("fires in 100ms when inside lead window", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const expiresAt = new Date(now + 3 * 86_400_000);
    expect(computeExpiryDelayMs(expiresAt, CREDIT_LEAD_MS, now)).toBe(100);
  });

  it("returns null when already expired", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const expiresAt = new Date(now - 86_400_000);
    expect(computeExpiryDelayMs(expiresAt, CREDIT_LEAD_MS, now)).toBeNull();
  });

  it("snooze delay is null when not strictly in the future", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(computeSnoozeDelayMs(new Date(now), now)).toBeNull();
    expect(computeSnoozeDelayMs(new Date(now - 1000), now)).toBeNull();
  });

  it("snooze delay returns positive ms when snoozeUntil is future", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(computeSnoozeDelayMs(new Date(now + 3 * 86_400_000), now)).toBe(3 * 86_400_000);
  });
});

describe("scheduleWarrantyReminder (producer)", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  const warranty = {
    id: "00000000-0000-4000-8000-0000000000c1",
    userId: "00000000-0000-4000-8000-0000000000b1",
    itemTitle: "Jeans",
    provider: "Mock Mart",
  };

  it("skips when there is no future coverageUntil", async () => {
    expect(await scheduleWarrantyReminder({ ...warranty, coverageUntil: null })).toBe("skipped");
  });

  it("skips when already expired", async () => {
    process.env.REDIS_URL = REDIS;
    const result = await scheduleWarrantyReminder({
      ...warranty,
      coverageUntil: new Date(Date.now() - 86_400_000),
    });
    expect(result).toBe("skipped");
  });

  it("skips when Redis is not configured (outside production)", async () => {
    const result = await scheduleWarrantyReminder({
      ...warranty,
      coverageUntil: new Date(Date.now() + 86_400_000),
    });
    expect(result).toBe("skipped");
  });

  it("publishes with a jobId keyed on the coverage end", async () => {
    process.env.REDIS_URL = REDIS;
    const coverageUntil = new Date(Date.now() + 30 * 86_400_000);
    const result = await scheduleWarrantyReminder({ ...warranty, coverageUntil });
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "warranty-expiry-reminder",
      expect.objectContaining({ warrantyId: warranty.id }),
      expect.objectContaining({
        jobId: jobIdFrom(`warranty-expiry:${warranty.id}`, coverageUntil.toISOString()),
      }),
    );
    expect(jobIdOf(0)).not.toContain(":");
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = REDIS;
    queueMocks.failAdd = true;
    await expect(
      scheduleWarrantyReminder({ ...warranty, coverageUntil: new Date(Date.now() + 30 * 86_400_000) }),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});

describe("scheduleExpiryReminder (producer)", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  const account = {
    id: "00000000-0000-4000-8000-0000000000a1",
    userId: "00000000-0000-4000-8000-0000000000b1",
    merchant: "Amazon",
  };

  it("skips when there is no expiresAt", async () => {
    expect(await scheduleExpiryReminder({ ...account, expiresAt: null })).toBe("skipped");
  });

  it("skips when already expired", async () => {
    process.env.REDIS_URL = REDIS;
    const result = await scheduleExpiryReminder({
      ...account,
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    expect(result).toBe("skipped");
  });

  it("skips when Redis is not configured (outside production)", async () => {
    const result = await scheduleExpiryReminder({
      ...account,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(result).toBe("skipped");
  });

  it("publishes with a jobId keyed on the expiry; a new expiry is a new job", async () => {
    process.env.REDIS_URL = REDIS;
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    const result = await scheduleExpiryReminder({ ...account, expiresAt });
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "credit-expiry-reminder",
      expect.objectContaining({ accountId: account.id, merchant: "Amazon" }),
      expect.objectContaining({
        jobId: jobIdFrom(`credit-expiry:${account.id}`, expiresAt.toISOString()),
      }),
    );
    await scheduleExpiryReminder({ ...account, expiresAt: new Date(Date.now() + 60 * 86_400_000) });
    expect(jobIdOf(1)).not.toBe(jobIdOf(0));
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = REDIS;
    queueMocks.failAdd = true;
    await expect(
      scheduleExpiryReminder({ ...account, expiresAt: new Date(Date.now() + 30 * 86_400_000) }),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});

describe("snoozeWarrantyReminder (producer)", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  const warranty = {
    id: "00000000-0000-4000-8000-0000000000c9",
    userId: "00000000-0000-4000-8000-0000000000b9",
    itemTitle: "Blazer",
    provider: "Mock Mart",
    coverageUntil: new Date(Date.now() + 60 * 86_400_000),
  };

  it("skips when Redis is not configured", async () => {
    expect(await snoozeWarrantyReminder(warranty, new Date(Date.now() + 86_400_000))).toBe(
      "skipped",
    );
  });

  it("skips when coverageUntil is missing", async () => {
    process.env.REDIS_URL = REDIS;
    expect(
      await snoozeWarrantyReminder(
        { ...warranty, coverageUntil: null },
        new Date(Date.now() + 86_400_000),
      ),
    ).toBe("skipped");
  });

  it("skips when snoozeUntil is not in the future", async () => {
    process.env.REDIS_URL = REDIS;
    expect(await snoozeWarrantyReminder(warranty, new Date(Date.now() - 1000))).toBe("skipped");
    expect(queueMocks.add).not.toHaveBeenCalled();
  });

  it("publishes its own job (not swallowed by the original reminder's id)", async () => {
    process.env.REDIS_URL = REDIS;
    const snoozeUntil = new Date(Date.now() + 3 * 86_400_000);
    await scheduleWarrantyReminder(warranty);
    const result = await snoozeWarrantyReminder(warranty, snoozeUntil);
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenLastCalledWith(
      "warranty-expiry-reminder",
      expect.objectContaining({
        warrantyId: warranty.id,
        itemTitle: "Blazer",
        snoozedUntil: snoozeUntil.toISOString(),
      }),
      expect.objectContaining({
        jobId: jobIdFrom(`warranty-expiry:${warranty.id}`, "snooze", snoozeUntil.toISOString()),
        delay: expect.any(Number),
      }),
    );
    expect(jobIdOf(1)).not.toBe(jobIdOf(0));
    const opts = queueMocks.add.mock.calls[1]![2] as { delay: number };
    expect(opts.delay).toBeGreaterThan(0);
    expect(opts.delay).toBeLessThanOrEqual(3 * 86_400_000 + 1000);
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = REDIS;
    queueMocks.failAdd = true;
    await expect(
      snoozeWarrantyReminder(warranty, new Date(Date.now() + 86_400_000)),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});

describe("snoozeCreditReminder (producer)", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  const account = {
    id: "00000000-0000-4000-8000-0000000000c1",
    userId: "00000000-0000-4000-8000-0000000000b1",
    merchant: "Myntra",
    expiresAt: new Date(Date.now() + 5 * 86_400_000),
  };

  it("skips when Redis is not configured", async () => {
    expect(
      await snoozeCreditReminder(account, new Date(Date.now() + CREDIT_SNOOZE_DEFAULT_MS)),
    ).toBe("skipped");
  });

  it("publishes a snooze job keyed on the snooze time", async () => {
    process.env.REDIS_URL = REDIS;
    const snoozeUntil = new Date(Date.now() + CREDIT_SNOOZE_DEFAULT_MS);
    const result = await snoozeCreditReminder(account, snoozeUntil);
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "credit-expiry-reminder",
      expect.objectContaining({
        accountId: account.id,
        merchant: "Myntra",
        snoozedUntil: snoozeUntil.toISOString(),
      }),
      expect.objectContaining({
        jobId: jobIdFrom(`credit-expiry:${account.id}`, "snooze", snoozeUntil.toISOString()),
        delay: expect.any(Number),
      }),
    );
  });
});
