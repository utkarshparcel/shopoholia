import { describe, expect, it, vi } from "vitest";
import {
  createBullmqExpiryWorker,
  createMemoryExpiryWorker,
  CREDIT_EXPIRY_QUEUE,
  processExpiry,
  CREDIT_EXPIRY_EVENT,
} from "./index.js";
import type { CreditExpiryPayload } from "./index.js";
import { moneyAccounts } from "@worn/db";
import { mockDb as mockTables, type MockUser } from "./mock-db.test-helper.js";

const payload: CreditExpiryPayload = {
  accountId: "00000000-0000-4000-8000-0000000000a1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  merchant: "Amazon",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockDb(
  opts: { user?: MockUser; account?: { status: string; expiresAt: Date | null } | null } = {},
) {
  const accountRows =
    opts.account === null ? [] : [opts.account ?? { status: "ACTIVE", expiresAt: new Date(payload.expiresAt) }];
  return mockTables(opts.user, [[moneyAccounts, accountRows]]);
}

describe("worker-expiry queue", () => {
  it("registers the credit-expiry queue name", () => {
    expect(CREDIT_EXPIRY_QUEUE).toBe("credit-expiry");
  });

  it("processExpiry writes a CREDIT_EXPIRY push_events row with expiry deep link", async () => {
    const db = mockDb();
    const result = await processExpiry(payload, db, { now: NOON });

    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]!.eventType).toBe(CREDIT_EXPIRY_EVENT);
    expect(db.inserted[0]!.userId).toBe(payload.userId);
    expect(db.inserted[0]!.dedupeKey).toBe(`credit-expiry:${payload.accountId}:${payload.expiresAt}`);
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: "worn://vault?focus=expiry",
      screen: "vault",
    });
  });

  it("a snoozed reminder is its own push row", async () => {
    const db = mockDb();
    await processExpiry(payload, db, { now: NOON });
    const snoozedUntil = "2026-09-02T04:30:00.000Z";
    expect((await processExpiry({ ...payload, snoozedUntil }, db, { now: NOON })).status).toBe("queued");
    expect(db.inserted.map((row) => row.dedupeKey)).toEqual([
      `credit-expiry:${payload.accountId}:${payload.expiresAt}`,
      `credit-expiry:${payload.accountId}:${payload.expiresAt}:snooze:${snoozedUntil}`,
    ]);
  });

  it("skips when credits category is opted out", async () => {
    const db = mockDb({
      user: {
        prefs: {
          notifications: {
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            categories: {
              returns: true,
              warranty: true,
              credits: false,
              outfits: true,
            },
          },
        },
      },
    });
    const result = await processExpiry(payload, db, { now: NOON });
    expect(result).toEqual({ status: "skipped" });
    expect(db.inserted).toHaveLength(0);
  });

  it("enqueue → send mock marks SENT, and a rerun sends nothing", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-c1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[credit]" } });
    const result = await processExpiry(payload, db, { now: NOON, sendExpo });
    expect(result.status).toBe("sent");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-c1" });
    expect((await processExpiry(payload, db, { now: NOON, sendExpo })).status).toBe("skipped");
    expect(sendExpo).toHaveBeenCalledTimes(1);
  });

  it("skips a missing user, a closed or used-up credit, and a changed expiry", async () => {
    const cases = [
      mockDb({ user: null }),
      mockDb({ account: null }),
      mockDb({ account: { status: "CLOSED", expiresAt: new Date(payload.expiresAt) } }),
      mockDb({ account: { status: "ACTIVE", expiresAt: new Date(Date.parse(payload.expiresAt) + 86_400_000) } }),
      mockDb({ account: { status: "ACTIVE", expiresAt: null } }),
    ];
    for (const db of cases) {
      expect(await processExpiry(payload, db, { now: NOON })).toEqual({ status: "skipped" });
      expect(db.inserted).toHaveLength(0);
    }
  });

  it("shows the expiry date on the user's wall clock", async () => {
    // 20:00 UTC on the 27th is 01:30 IST on the 28th.
    const expiresAt = "2026-08-27T20:00:00.000Z";
    const db = mockDb({ account: { status: "ACTIVE", expiresAt: new Date(expiresAt) } });
    await processExpiry({ ...payload, expiresAt }, db, { now: NOON });
    expect(db.inserted[0]!.body).toBe(
      "Your Amazon gift card or store credit expires on 28 Aug. Use it before it's gone.",
    );
  });

  it("runs in-memory jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryExpiryWorker(handler, { autoProcess: false });
    expect(worker.queue).toBe(CREDIT_EXPIRY_QUEUE);

    await worker.start();
    await worker.enqueue(payload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(payload);
    await worker.stop();
  });

  it("refuses to build a BullMQ worker without Redis or without a Db", () => {
    expect(() => createBullmqExpiryWorker()).toThrow(/REDIS_URL/);
    expect(() => createBullmqExpiryWorker({ redisUrl: "redis://127.0.0.1:1" })).toThrow(/Db is required/);
  });

  it.skipIf(!process.env.TEST_REDIS_URL)("builds the BullMQ worker on a real Redis", async () => {
    const worker = createBullmqExpiryWorker({ redisUrl: process.env.TEST_REDIS_URL, db: mockDb() });
    expect(worker.worker.name).toBe(CREDIT_EXPIRY_QUEUE);
    await worker.stop();
  });
});
