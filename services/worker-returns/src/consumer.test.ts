import { describe, expect, it, vi } from "vitest";
import {
  createBullmqReturnsWorker,
  createMemoryReturnsWorker,
  RETURN_DEADLINE_QUEUE,
  RETURN_DEADLINE_EVENT,
  processReturnDeadline,
} from "./index.js";
import type { ReturnDeadlinePayload } from "./index.js";
import { pushEvents, returnRequests, users, type Db } from "@worn/db";

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
    prefs?: Record<string, unknown>;
    pushToken?: string | null;
  } | null;
  returnRequest?: { state: string; windowDeadline: Date } | null;
} = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const userRows =
    opts.user === null
      ? []
      : [
          {
            prefs: opts.user?.prefs ?? {},
            timeZone: "Asia/Kolkata",
            pushToken: opts.user?.pushToken ?? null,
          },
        ];
  const returnRows =
    opts.returnRequest === null
      ? []
      : [opts.returnRequest ?? { state: "REQUESTED", windowDeadline: new Date(payload.windowDeadline) }];
  // push_events keyed by dedupe key, like the unique index.
  const rows = new Map<string, { id: string; status: string }>();

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              table === users ? userRows : table === returnRequests ? returnRows : [],
            ),
        }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            const key = String(v.dedupeKey);
            if (rows.has(key)) return Promise.resolve([]);
            inserted.push(v);
            const row = { id: `pe-${rows.size + 1}`, status: "QUEUED" };
            rows.set(key, row);
            return Promise.resolve([row]);
          },
        }),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated.push(v);
          for (const row of rows.values()) if (v.status) row.status = String(v.status);
          return Promise.resolve();
        },
      }),
    }),
    inserted,
    updated,
  };
  // The conflict path re-reads the row by dedupe key.
  const select = db.select;
  db.select = () => ({
    from: (table: unknown) =>
      table === pushEvents
        ? {
            where: () => ({ limit: () => Promise.resolve([...rows.values()].slice(0, 1)) }),
          }
        : select().from(table),
  });

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
    expect(db.inserted[0]!.dedupeKey).toBe(
      `return-deadline:${payload.returnId}:${payload.windowDeadline}`,
    );
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
        prefs: {
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

  it("refuses to build a BullMQ worker without Redis or without a Db", () => {
    expect(() => createBullmqReturnsWorker()).toThrow(/REDIS_URL/);
    // Throws before connecting: every job would fail without a Db.
    expect(() => createBullmqReturnsWorker({ redisUrl: "redis://127.0.0.1:1" })).toThrow(/Db is required/);
  });

  it.skipIf(!process.env.TEST_REDIS_URL)("builds the BullMQ worker on a real Redis", async () => {
    const worker = createBullmqReturnsWorker({ redisUrl: process.env.TEST_REDIS_URL, db: mockDb() });
    expect(worker.worker.name).toBe(RETURN_DEADLINE_QUEUE);
    await worker.stop();
  });

  it("uses tomorrow copy when deadline is within one day", async () => {
    const windowDeadline = new Date(NOON.getTime() + 12 * 3_600_000);
    const db = mockDb({ returnRequest: { state: "REQUESTED", windowDeadline } });
    const result = await processReturnDeadline(
      { ...payload, windowDeadline: windowDeadline.toISOString() },
      db,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(db.inserted[0]!.title).toBe("Return window closes tomorrow");
  });

  it("skips a user who no longer exists", async () => {
    const db = mockDb({ user: null });
    const result = await processReturnDeadline(payload, db, { now: NOON });
    expect(result).toEqual({ status: "skipped" });
    expect(db.inserted).toHaveLength(0);
  });

  it("skips a return that was started, closed or moved since", async () => {
    for (const returnRequest of [
      null,
      { state: "INITIATED", windowDeadline: new Date(payload.windowDeadline) },
      { state: "CANCELLED", windowDeadline: new Date(payload.windowDeadline) },
      { state: "REQUESTED", windowDeadline: new Date(Date.parse(payload.windowDeadline) + 86_400_000) },
    ]) {
      const db = mockDb({ returnRequest, user: { pushToken: "ExponentPushToken[returns]" } });
      expect(await processReturnDeadline(payload, db, { now: NOON })).toEqual({ status: "skipped" });
      expect(db.inserted).toHaveLength(0);
    }
  });

  it("sends once when the job runs twice", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-r1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[returns]" } });
    expect((await processReturnDeadline(payload, db, { now: NOON, sendExpo })).status).toBe("sent");
    expect((await processReturnDeadline(payload, db, { now: NOON, sendExpo })).status).toBe("skipped");
    expect(sendExpo).toHaveBeenCalledTimes(1);
    expect(db.inserted).toHaveLength(1);
  });

  it("shows the deadline on the user's wall clock", async () => {
    // 20:00 UTC on the 27th is 01:30 IST on the 28th.
    const windowDeadline = new Date("2026-08-27T20:00:00.000Z");
    const db = mockDb({ returnRequest: { state: "REQUESTED", windowDeadline } });
    await processReturnDeadline({ ...payload, windowDeadline: windowDeadline.toISOString() }, db, { now: NOON });
    expect(db.inserted[0]!.body).toBe("Your return for Myntra closes on 28 Aug. Initiate now.");
  });
});
