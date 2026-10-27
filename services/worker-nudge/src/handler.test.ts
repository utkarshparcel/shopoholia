import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FREQUENCY_CAPS,
  FOUND_MONEY_WAITING_EVENT,
  MONTHLY_DIGEST_EVENT,
  WEEKLY_DIGEST_EVENT,
} from "@worn/shared";
import {
  NUDGE_QUEUE,
  processFoundMoneyWaiting,
  processMonthlyDigest,
  processWeeklyDigest,
} from "./index.js";
import type { Db } from "@worn/db";

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockDb(opts: {
  consentFlags?: Record<string, unknown>;
  pushToken?: string | null;
  recentCount?: number;
} = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const userRows = [
    {
      consentFlags: opts.consentFlags ?? {},
      pushToken: opts.pushToken ?? null,
    },
  ];

  const db = {
    select: (sel?: unknown) => {
      if (sel && typeof sel === "object" && "count" in (sel as object)) {
        return {
          from: () => ({
            where: () =>
              Promise.resolve([{ count: opts.recentCount ?? 0 }]),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(userRows),
          }),
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    inserted,
  };

  return db as unknown as Db & { inserted: Array<Record<string, unknown>> };
}

describe("worker-nudge", () => {
  it("registers closet-nudge queue", () => {
    expect(NUDGE_QUEUE).toBe("closet-nudge");
  });

  it("processFoundMoneyWaiting writes capped credits push with amount", async () => {
    const db = mockDb({ recentCount: 0 });
    const result = await processFoundMoneyWaiting(
      { userId: "u1", totalMinor: 240_000, accountCount: 2 },
      db,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(db.inserted[0]).toMatchObject({
      eventType: FOUND_MONEY_WAITING_EVENT,
      payload: expect.objectContaining({
        androidChannelId: "worn-credits",
        amountMinor: 240_000,
        deepLink: "worn://vault?focus=found-money",
      }),
    });
  });

  it("skips when frequency cap hit", async () => {
    const db = mockDb({ recentCount: DEFAULT_FREQUENCY_CAPS.credits });
    const result = await processFoundMoneyWaiting(
      { userId: "u1", totalMinor: 1000, accountCount: 1 },
      db,
      { now: NOON },
    );
    expect(result).toEqual({ status: "skipped" });
    expect(db.inserted).toHaveLength(0);
  });

  it("processWeeklyDigest includes digest channel", async () => {
    const db = mockDb();
    const result = await processWeeklyDigest(
      { userId: "u1", spendMinor: 9000, avgCostPerWearMinor: 300 },
      db,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(db.inserted[0]).toMatchObject({
      eventType: WEEKLY_DIGEST_EVENT,
      payload: expect.objectContaining({
        androidChannelId: "worn-digest",
      }),
    });
  });

  it("processMonthlyDigest includes spend + CPW + month deep link", async () => {
    const db = mockDb();
    const result = await processMonthlyDigest(
      {
        userId: "u1",
        spendMinor: 42_000,
        avgCostPerWearMinor: 750,
        monthLabel: "2026-08",
      },
      db,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(db.inserted[0]).toMatchObject({
      eventType: MONTHLY_DIGEST_EVENT,
      payload: expect.objectContaining({
        androidChannelId: "worn-digest",
        amountMinor: 42_000,
        deepLink: "worn://accountant?month=2026-08",
      }),
    });
  });

  it("delays inside quiet hours", async () => {
    const db = mockDb();
    const result = await processWeeklyDigest(
      { userId: "u1", spendMinor: 100 },
      db,
      { now: new Date("2026-08-26T23:30:00.000Z") },
    );
    expect(result.status).toBe("delayed");
  });

  it("rich Expo payload includes channelId on send", async () => {
    const db = mockDb({ pushToken: "ExponentPushToken[n]" });
    const sendExpo = vi.fn(async () => ({
      ok: true as const,
      ticketId: "t1",
    }));
    await processFoundMoneyWaiting(
      { userId: "u1", totalMinor: 5000, accountCount: 1 },
      db,
      { now: NOON, sendExpo },
    );
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "worn-credits" }),
    );
  });
});
