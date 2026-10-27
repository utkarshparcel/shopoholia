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
  RETURN_LEAD_MS,
  computeReturnReminderDelayMs,
  computeWindowDeadline,
  enrichDeadlineFromPurchaseItem,
  reconcileRefund,
  scheduleReturnDeadlineReminder,
  selectRefundAccount,
  withReturnDeadlineRichFields,
} from "./return-jobs.js";
import { QueueUnavailableError, jobIdFrom } from "./queues/enqueue.js";

/** The reminder's jobId is keyed on the return and its deadline. */
const returnJobId = (returnId: string, windowDeadline: string) =>
  jobIdFrom(`return:${returnId}`, windowDeadline);

describe("return-jobs lead times", () => {
  it("RETURN_LEAD_MS is 3 days", () => {
    expect(RETURN_LEAD_MS).toBe(3 * 86_400_000);
  });

  it("reminder fires at deadline − 3d", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const deadline = new Date(now + 30 * 86_400_000);
    expect(computeReturnReminderDelayMs(deadline, RETURN_LEAD_MS, now)).toBe(
      30 * 86_400_000 - RETURN_LEAD_MS,
    );
  });

  it("fires in 100ms when inside lead window", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const deadline = new Date(now + 2 * 86_400_000);
    expect(computeReturnReminderDelayMs(deadline, RETURN_LEAD_MS, now)).toBe(100);
  });

  it("returns null when window already closed", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const deadline = new Date(now - 86_400_000);
    expect(computeReturnReminderDelayMs(deadline, RETURN_LEAD_MS, now)).toBeNull();
  });

  it("computeWindowDeadline uses merchant table (case-insensitive)", () => {
    const purchased = new Date("2026-01-01T00:00:00.000Z");
    expect(computeWindowDeadline(purchased, "Amazon").toISOString()).toBe(
      new Date(purchased.getTime() + 30 * 86_400_000).toISOString(),
    );
    expect(computeWindowDeadline(purchased, "Flipkart").toISOString()).toBe(
      new Date(purchased.getTime() + 7 * 86_400_000).toISOString(),
    );
    expect(computeWindowDeadline(purchased, "Unknown Shop").toISOString()).toBe(
      new Date(purchased.getTime() + 14 * 86_400_000).toISOString(),
    );
  });
});

describe("selectRefundAccount", () => {
  it("prefers ACTIVE CASH over store credit", () => {
    const picked = selectRefundAccount(
      [
        { id: "sc", kind: "STORE_CREDIT", merchant: "Amazon", status: "ACTIVE" },
        { id: "cash", kind: "CASH", merchant: "worn", status: "ACTIVE" },
      ],
      "Amazon",
    );
    expect(picked?.id).toBe("cash");
  });

  it("falls back to matching STORE_CREDIT merchant", () => {
    const picked = selectRefundAccount(
      [{ id: "sc", kind: "STORE_CREDIT", merchant: "Amazon", status: "ACTIVE" }],
      "amazon",
    );
    expect(picked?.id).toBe("sc");
  });

  it("ignores frozen accounts and returns null when nothing matches", () => {
    expect(
      selectRefundAccount(
        [{ id: "x", kind: "CASH", merchant: "worn", status: "FROZEN" }],
        "Amazon",
      ),
    ).toBeNull();
  });
});

describe("reconcileRefund", () => {
  it("no-ops for non-positive refund", async () => {
    const postMoneyLedger = vi.fn();
    await reconcileRefund(
      { postMoneyLedger, listMoneyAccounts: async () => [] },
      "u1",
      "r1",
      0,
    );
    expect(postMoneyLedger).not.toHaveBeenCalled();
  });

  it("posts REFUND to preferred CASH account", async () => {
    const postMoneyLedger = vi.fn(async () => ({ balanceAfter: 500 }));
    await reconcileRefund(
      {
        postMoneyLedger,
        listMoneyAccounts: async () => [
          { id: "cash", kind: "CASH", merchant: "worn", status: "ACTIVE" },
        ],
      },
      "u1",
      "r1",
      500,
      "Amazon",
    );
    expect(postMoneyLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "cash",
        delta: 500,
        type: "REFUND",
        refId: "r1",
        refType: "return.refund:ORIGINAL_CARD",
      }),
    );
  });

  it("creates a Refund CASH account when none exist", async () => {
    const postMoneyLedger = vi.fn(async () => ({ balanceAfter: 200 }));
    const createMoneyAccount = vi.fn(async () => ({ id: "new-cash" }));
    await reconcileRefund(
      {
        postMoneyLedger,
        listMoneyAccounts: async () => [],
        createMoneyAccount,
      },
      "u1",
      "r2",
      200,
    );
    expect(createMoneyAccount).toHaveBeenCalled();
    expect(postMoneyLedger).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "new-cash", delta: 200 }),
    );
  });
});

describe("scheduleReturnDeadlineReminder", () => {
  const originalRedis = process.env.REDIS_URL;
  const originalReturnRedis = process.env.RETURN_REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.RETURN_REDIS_URL;
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  afterEach(() => {
    queueMocks.failAdd = false;
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
    if (originalReturnRedis) process.env.RETURN_REDIS_URL = originalReturnRedis;
    else delete process.env.RETURN_REDIS_URL;
  });

  it("skips when Redis is unavailable", async () => {
    const result = await scheduleReturnDeadlineReminder({
      returnId: "r1",
      userId: "u1",
      windowDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      merchant: "Amazon",
    });
    expect(result).toBe("skipped");
  });

  it("skips when window already closed", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const result = await scheduleReturnDeadlineReminder({
      returnId: "r1",
      userId: "u1",
      windowDeadline: new Date(Date.now() - 86_400_000).toISOString(),
      merchant: "Amazon",
    });
    expect(result).toBe("skipped");
  });

  it("publishes when Queue succeeds", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const windowDeadline = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const result = await scheduleReturnDeadlineReminder({
      returnId: "r1",
      userId: "u1",
      windowDeadline,
      merchant: "Amazon",
    });
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "return-deadline-reminder",
      expect.objectContaining({ returnId: "r1", merchant: "Amazon" }),
      expect.objectContaining({ jobId: returnJobId("r1", windowDeadline) }),
    );
  });

  it("a moved deadline gets its own job", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const base = { returnId: "r1", userId: "u1", merchant: "Amazon" };
    await scheduleReturnDeadlineReminder({
      ...base,
      windowDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    });
    await scheduleReturnDeadlineReminder({
      ...base,
      windowDeadline: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    });
    const ids = queueMocks.add.mock.calls.map((c) => (c[2] as { jobId: string }).jobId);
    expect(new Set(ids).size).toBe(2);
  });

  it("publishes rich payload with imageUrl (WV01-DEADLINE-IMAGE-PUSH)", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const enriched = withReturnDeadlineRichFields(
      {
        returnId: "r2",
        userId: "u1",
        windowDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        merchant: "Myntra",
      },
      {
        imageUrl: "https://cdn.example/jacket.jpg",
        amountMinor: 199_900,
        currency: "INR",
      },
    );
    expect(enriched.imageUrl).toBe("https://cdn.example/jacket.jpg");
    expect(enriched.amountMinor).toBe(199_900);

    const result = await scheduleReturnDeadlineReminder(enriched);
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "return-deadline-reminder",
      expect.objectContaining({
        returnId: "r2",
        imageUrl: "https://cdn.example/jacket.jpg",
        amountMinor: 199_900,
        currency: "INR",
      }),
      expect.objectContaining({ jobId: returnJobId("r2", enriched.windowDeadline) }),
    );
  });

  it("throws QueueUnavailableError when enqueue fails", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.failAdd = true;
    try {
      await expect(
        scheduleReturnDeadlineReminder({
          returnId: "r1",
          userId: "u1",
          windowDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
          merchant: "Amazon",
        }),
      ).rejects.toBeInstanceOf(QueueUnavailableError);
    } finally {
      queueMocks.failAdd = false;
    }
  });
});

describe("withReturnDeadlineRichFields", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.RETURN_REDIS_URL;
    queueMocks.add.mockReset();
    queueMocks.add.mockResolvedValue({});
    queueMocks.close.mockClear();
    queueMocks.failAdd = false;
  });

  it("attaches imageUrl + amount when present", () => {
    const base = {
      returnId: "r1",
      userId: "u1",
      windowDeadline: "2026-09-01T00:00:00.000Z",
      merchant: "Amazon",
    };
    expect(
      withReturnDeadlineRichFields(base, {
        imageUrl: " https://cdn.example/x.jpg ",
        amountMinor: 500,
        currency: "INR",
      }),
    ).toEqual({
      ...base,
      imageUrl: "https://cdn.example/x.jpg",
      amountMinor: 500,
      currency: "INR",
    });
  });

  it("skips blank image and non-positive amounts", () => {
    const base = {
      returnId: "r1",
      userId: "u1",
      windowDeadline: "2026-09-01T00:00:00.000Z",
      merchant: "Amazon",
    };
    expect(withReturnDeadlineRichFields(base, { imageUrl: "  ", amountMinor: 0 })).toEqual(base);
  });

  it("enrichDeadlineFromPurchaseItem signs imageKey", async () => {
    const payload = await enrichDeadlineFromPurchaseItem(
      {
        returnId: "r1",
        userId: "u1",
        windowDeadline: "2026-09-01T00:00:00.000Z",
        merchant: "Amazon",
      },
      { imageKey: "items/tee.jpg", priceMinor: 1200 },
      async (key) => `https://cdn.test/${key}`,
      "INR",
    );
    expect(payload).toMatchObject({
      imageUrl: "https://cdn.test/items/tee.jpg",
      amountMinor: 1200,
      currency: "INR",
    });
  });

  it("enrichDeadlineFromPurchaseItem uses brand placeholder when no image (W042)", async () => {
    const base = {
      returnId: "r1",
      userId: "u1",
      windowDeadline: "2026-09-01T00:00:00.000Z",
      merchant: "Amazon",
    };
    const payload = await enrichDeadlineFromPurchaseItem(
      base,
      { imageKey: null, priceMinor: 999 },
      async (key) => `https://cdn.test/${key}`,
      "INR",
    );
    expect(payload.imageUrl).toBe("https://cdn.test/brand/worn-return-deadline.png");
    expect(payload.amountMinor).toBe(999);
    expect(payload.currency).toBe("INR");
  });

  it("enrichDeadlineFromPurchaseItem placeholders when item missing (W042)", async () => {
    const base = {
      returnId: "r1",
      userId: "u1",
      windowDeadline: "2026-09-01T00:00:00.000Z",
      merchant: "Amazon",
    };
    const payload = await enrichDeadlineFromPurchaseItem(base, null, async (key) => `signed:${key}`);
    expect(payload.imageUrl).toBe("signed:brand/worn-return-deadline.png");
  });

  it("publishes rich payload with placeholder image still SENT (W042)", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    const enriched = await enrichDeadlineFromPurchaseItem(
      {
        returnId: "r3",
        userId: "u1",
        windowDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        merchant: "Flipkart",
      },
      { imageKey: null, priceMinor: 500 },
      async () => {
        throw new Error("no sign");
      },
    );
    expect(enriched.imageUrl).toBe("https://worn.app/brand/return-deadline.png");
    const result = await scheduleReturnDeadlineReminder(enriched);
    expect(result).toBe("published");
    expect(queueMocks.add).toHaveBeenCalledWith(
      "return-deadline-reminder",
      expect.objectContaining({
        returnId: "r3",
        imageUrl: "https://worn.app/brand/return-deadline.png",
      }),
      expect.objectContaining({ jobId: returnJobId("r3", enriched.windowDeadline) }),
    );
  });
});
