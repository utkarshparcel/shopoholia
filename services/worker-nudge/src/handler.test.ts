import { afterEach, describe, expect, it, vi } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  DEFAULT_FREQUENCY_CAPS,
  FOUND_MONEY_WAITING_EVENT,
  MONTHLY_DIGEST_EVENT,
  WEEKLY_DIGEST_EVENT,
  type DeadLetter,
} from "@worn/shared";
import {
  createBullmqNudgeWorker,
  NUDGE_QUEUE,
  processFoundMoneyWaiting,
  processMonthlyDigest,
  processNudgeJob,
  processWeeklyDigest,
} from "./index.js";
import type { Db } from "@worn/db";

const NOON = new Date("2026-08-26T12:00:00.000Z");

/**
 * A Db stand-in: the count select returns `recentCount`, the user select returns the user, and
 * push_events keeps one row per dedupe key (like the unique index).
 */
function mockDb(opts: {
  prefs?: Record<string, unknown>;
  pushToken?: string | null;
  recentCount?: number;
  user?: null;
} = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const userRows =
    opts.user === null
      ? []
      : [{ prefs: opts.prefs ?? {}, timeZone: "Asia/Kolkata", pushToken: opts.pushToken ?? null }];
  const pushRows = new Map<string, { id: string; status: string }>();
  let lastKey = "";

  const db = {
    select: (sel?: unknown) => {
      if (sel && typeof sel === "object" && "count" in (sel as object)) {
        return {
          from: () => ({
            where: () => Promise.resolve([{ count: opts.recentCount ?? 0 }]),
          }),
        };
      }
      if (sel && typeof sel === "object" && "prefs" in (sel as object)) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve(userRows) }) }) };
      }
      // recordPushEventIfNew's read of the existing row after a conflict.
      return {
        from: () => ({
          where: () => ({ limit: () => Promise.resolve(pushRows.has(lastKey) ? [pushRows.get(lastKey)] : []) }),
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            lastKey = String(v.dedupeKey);
            if (pushRows.has(lastKey)) return Promise.resolve([]);
            inserted.push(v);
            const row = { id: `pe-${pushRows.size + 1}`, status: "QUEUED" };
            pushRows.set(lastKey, row);
            return Promise.resolve([row]);
          },
        }),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated.push(v);
          const row = pushRows.get(lastKey);
          if (row && typeof v.status === "string") row.status = v.status;
          return Promise.resolve();
        },
      }),
    }),
    inserted,
    updated,
  };

  return db as unknown as Db & {
    inserted: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

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
      dedupeKey: "found-money:u1:2026-W35",
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
      dedupeKey: "monthly-digest:u1:2026-08",
      payload: expect.objectContaining({
        androidChannelId: "worn-digest",
        amountMinor: 42_000,
        deepLink: "worn://accountant?month=2026-08",
      }),
    });
  });

  it("delays inside the user's quiet hours", async () => {
    const db = mockDb();
    // 23:30 UTC is 05:00 IST.
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

  it("sends once when a job runs twice, even if the rerun lands in the next week", async () => {
    const db = mockDb({ pushToken: "ExponentPushToken[n]" });
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t1" }));
    const payload = { userId: "u1", spendMinor: 9000 };
    expect((await processWeeklyDigest(payload, db, { now: NOON, createdAt: NOON, sendExpo })).status).toBe("sent");
    const nextWeek = new Date(NOON.getTime() + 7 * 86_400_000);
    expect((await processWeeklyDigest(payload, db, { now: nextWeek, createdAt: NOON, sendExpo })).status).toBe(
      "skipped",
    );
    expect(sendExpo).toHaveBeenCalledTimes(1);
    expect(db.inserted).toHaveLength(1);
  });

  it("skips a user who no longer exists", async () => {
    const db = mockDb({ user: null });
    for (const run of [
      processFoundMoneyWaiting({ userId: "u1", totalMinor: 1, accountCount: 1 }, db, { now: NOON }),
      processWeeklyDigest({ userId: "u1", spendMinor: 1 }, db, { now: NOON }),
      processMonthlyDigest({ userId: "u1", spendMinor: 1 }, db, { now: NOON }),
    ]) {
      expect(await run).toEqual({ status: "skipped" });
    }
    expect(db.inserted).toHaveLength(0);
  });

  it("rejects an unknown job name without retrying it", async () => {
    await expect(processNudgeJob("nope", { userId: "u1", spendMinor: 1 }, mockDb())).rejects.toMatchObject({
      name: "UnrecoverableError",
    });
  });

  it("refuses to build a BullMQ worker without Redis or without a Db", () => {
    vi.stubEnv("REDIS_URL", "");
    expect(() => createBullmqNudgeWorker()).toThrow(/REDIS_URL/);
    expect(() => createBullmqNudgeWorker({ redisUrl: "redis://127.0.0.1:1" })).toThrow(/Db is required/);
  });

  it.skipIf(!process.env.TEST_REDIS_URL)(
    "on a real Redis, a job with an unknown name is dead-lettered on its first attempt",
    async () => {
      const connection = new Redis(process.env.TEST_REDIS_URL!, { maxRetriesPerRequest: null });
      const queue = new Queue(NUDGE_QUEUE, { connection });
      await queue.obliterate({ force: true });
      const letters: DeadLetter[] = [];
      const consumer = createBullmqNudgeWorker({
        connection,
        db: mockDb(),
        recordDeadLetter: async (entry) => void letters.push(entry),
      });
      try {
        await consumer.start();
        const failed = new Promise<void>((resolve) => consumer.worker.once("failed", () => resolve()));
        await queue.add("nope", { userId: "u1", spendMinor: 1 }, { jobId: "nudge-e2e-unknown", attempts: 3 });
        await failed;
        expect(letters).toHaveLength(1);
        expect(letters[0]).toMatchObject({ queue: NUDGE_QUEUE, jobId: "nudge-e2e-unknown", attemptsMade: 1 });
        expect(letters[0]!.data).toEqual({ userId: "u1", spendMinor: 1 });
      } finally {
        await consumer.stop();
        await queue.obliterate({ force: true });
        await queue.close();
        await connection.quit();
      }
    },
  );
});
