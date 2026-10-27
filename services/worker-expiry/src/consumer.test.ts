import { describe, expect, it, vi } from "vitest";
import {
  createBullmqExpiryWorker,
  createMemoryExpiryWorker,
  CREDIT_EXPIRY_QUEUE,
  processExpiry,
  CREDIT_EXPIRY_EVENT,
} from "./index.js";
import type { CreditExpiryPayload } from "./index.js";
import type { Db } from "@worn/db";

const payload: CreditExpiryPayload = {
  accountId: "00000000-0000-4000-8000-0000000000a1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  merchant: "Amazon",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockDb(opts: {
  user?: {
    consentFlags?: Record<string, unknown>;
    pushToken?: string | null;
  } | null;
} = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const userRows =
    opts.user === null
      ? []
      : [
          {
            consentFlags: opts.user?.consentFlags ?? {},
            pushToken: opts.user?.pushToken ?? null,
          },
        ];

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(userRows),
        }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated.push(v);
          return Promise.resolve();
        },
      }),
    }),
    inserted,
    updated,
  } as unknown as Db & {
    inserted: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
  };
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
    expect(db.inserted[0]!.dedupeKey).toBe(`credit-expiry:${payload.accountId}`);
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: "worn://vault?focus=expiry",
      screen: "vault",
    });
  });

  it("skips when credits category is opted out", async () => {
    const db = mockDb({
      user: {
        consentFlags: {
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

  it("enqueue → send mock marks SENT", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-c1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[credit]" } });
    const result = await processExpiry(payload, db, { now: NOON, sendExpo });
    expect(result.status).toBe("sent");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-c1" });
  });

  it("defaults missing user row to empty consentFlags", async () => {
    const db = mockDb({ user: null });
    const result = await processExpiry(payload, db, { now: NOON });
    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
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

  it("exposes a BullMQ scaffold that needs Redis to start", async () => {
    expect(() => createBullmqExpiryWorker()).toThrow(/REDIS_URL/);
    const worker = createBullmqExpiryWorker({
      redisUrl: "redis://localhost:6379",
    });
    expect(worker.worker.name).toBe(CREDIT_EXPIRY_QUEUE);
    await worker.stop();
  });
});
