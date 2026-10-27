import { describe, expect, it, vi } from "vitest";
import {
  createBullmqReturnsWorker,
  createMemoryReturnsWorker,
  RETURN_DEADLINE_QUEUE,
  RETURN_DEADLINE_EVENT,
  processReturnDeadline,
} from "./index.js";
import type { ReturnDeadlinePayload } from "./index.js";
import type { Db } from "@worn/db";

const payload: ReturnDeadlinePayload = {
  returnId: "00000000-0000-4000-8000-0000000000r1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  windowDeadline: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  merchant: "Myntra",
};

/** Midday UTC — outside default quiet hours (22:00–07:00). */
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

  const db = {
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
  };

  return db as unknown as Db & {
    inserted: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
  };
}

describe("worker-returns queue", () => {
  it("registers the return-deadline queue name", () => {
    expect(RETURN_DEADLINE_QUEUE).toBe("return-deadline");
  });

  it("processReturnDeadline writes a RETURN_DEADLINE push_events row with deep link", async () => {
    const db = mockDb();
    const result = await processReturnDeadline(payload, db, { now: NOON });

    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]!.eventType).toBe(RETURN_DEADLINE_EVENT);
    expect(db.inserted[0]!.userId).toBe(payload.userId);
    expect(db.inserted[0]!.dedupeKey).toBe(`return-deadline:${payload.returnId}`);
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: "worn://returns",
      screen: "returns",
    });
    expect(String(db.inserted[0]!.title)).toMatch(/Return window closes/i);
  });

  it("includes image URL + Android channel in rich return payload", async () => {
    const db = mockDb();
    const result = await processReturnDeadline(
      {
        ...payload,
        imageUrl: "https://cdn.example/item.jpg",
        amountMinor: 199_900,
        currency: "INR",
      },
      db,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: "worn://returns",
      imageUrl: "https://cdn.example/item.jpg",
      amountMinor: 199_900,
      androidChannelId: "worn-returns",
    });
  });

  it("skips when returns category is opted out", async () => {
    const db = mockDb({
      user: {
        consentFlags: {
          notifications: {
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            categories: {
              returns: false,
              warranty: true,
              credits: true,
              outfits: true,
            },
          },
        },
      },
    });
    const result = await processReturnDeadline(payload, db, { now: NOON });
    expect(result).toEqual({ status: "skipped" });
    expect(db.inserted).toHaveLength(0);
  });

  it("delays when inside quiet hours", async () => {
    const db = mockDb();
    const result = await processReturnDeadline(payload, db, {
      now: new Date("2026-08-26T23:00:00.000Z"),
    });
    expect(result.status).toBe("delayed");
    if (result.status === "delayed") {
      expect(result.delayMs).toBeGreaterThan(0);
    }
    expect(db.inserted).toHaveLength(0);
  });

  it("enqueue → send mock marks SENT when push token present", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-r1" }));
    const db = mockDb({
      user: { pushToken: "ExponentPushToken[returns]" },
    });
    const result = await processReturnDeadline(payload, db, {
      now: NOON,
      sendExpo,
    });
    expect(result.status).toBe("sent");
    expect(sendExpo).toHaveBeenCalled();
    expect(db.updated).toContainEqual(
      expect.objectContaining({ status: "SENT", expoTicketId: "ticket-r1" }),
    );
  });

  it("runs in-memory jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryReturnsWorker(handler, { autoProcess: false });
    expect(worker.queue).toBe(RETURN_DEADLINE_QUEUE);

    await worker.start();
    await worker.enqueue(payload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(payload);
    await worker.stop();
  });

  it("exposes a BullMQ scaffold that needs Redis to start", async () => {
    expect(() => createBullmqReturnsWorker()).toThrow(/REDIS_URL/);
    const worker = createBullmqReturnsWorker({
      redisUrl: "redis://localhost:6379",
    });
    expect(worker.worker.name).toBe(RETURN_DEADLINE_QUEUE);
    await worker.stop();
  });

  it("uses tomorrow copy when deadline is within one day", async () => {
    const db = mockDb();
    const result = await processReturnDeadline(
      {
        ...payload,
        windowDeadline: new Date(NOON.getTime() + 12 * 3_600_000).toISOString(),
      },
      db,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(db.inserted[0]!.title).toBe("Return window closes tomorrow");
  });

  it("defaults missing user to empty consentFlags", async () => {
    const db = mockDb({ user: null });
    const result = await processReturnDeadline(payload, db, { now: NOON });
    expect(result.status).toBe("queued");
  });
});
