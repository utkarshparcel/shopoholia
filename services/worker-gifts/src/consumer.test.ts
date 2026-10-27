import { afterEach, describe, expect, it, vi } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  createBullmqGiftWorker,
  createBullmqTailoringWorker,
  createMemoryGiftWorker,
  createMemoryTailoringWorker,
  GIFT_OCCASION_QUEUE,
  TAILORING_JOB,
  TAILORING_QUEUE,
  processGiftOccasion,
  processTailoringTransition,
} from "./index.js";
import type { GiftOccasionPayload, TailoringPayload } from "./index.js";
import {
  pushEvents,
  recipientProfiles,
  recipients,
  tailoringOrders,
  users,
  type Db,
} from "@worn/db";

const giftPayload: GiftOccasionPayload = {
  userId: "00000000-0000-4000-8000-0000000000b1",
  recipientId: "00000000-0000-4000-8000-0000000000c1",
  occasion: "birthday",
  date: "2026-09-01",
};

const tailoringPayload: TailoringPayload = {
  orderId: "00000000-0000-4000-8000-0000000000d1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  toState: "CONFIRMED",
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

type MockUser = { prefs?: Record<string, unknown>; timeZone?: string; pushToken?: string | null } | null;

/**
 * A Db stand-in: a select returns the rows given for its table, push_events keeps one row per
 * dedupe key (like the unique index), and a tailoring order move updates the order unless the
 * move is set to lose a race.
 */
function mockDb(
  opts: {
    user?: MockUser;
    recipient?: { name: string } | null;
    dates?: Array<{ occasion: string; date: string; label?: string }> | null;
    order?: { id: string; state: string } | null;
    loseRace?: boolean;
  } = {},
) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const order = opts.order === null ? null : { ...(opts.order ?? { id: tailoringPayload.orderId, state: "PENDING" }) };
  const rows = new Map<unknown, Array<Record<string, unknown>>>([
    [
      users,
      opts.user === null
        ? []
        : [{ prefs: opts.user?.prefs ?? {}, timeZone: opts.user?.timeZone ?? "Asia/Kolkata", pushToken: opts.user?.pushToken ?? null }],
    ],
    [recipients, opts.recipient === null ? [] : [opts.recipient ?? { name: "Sam" }]],
    [
      recipientProfiles,
      opts.dates === null ? [] : [{ importantDates: opts.dates ?? [{ occasion: giftPayload.occasion, date: giftPayload.date }] }],
    ],
  ]);
  const pushRows = new Map<string, { id: string; status: string }>();
  let lastKey = "";
  let selects = 0;

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            selects += 1;
            if (table === tailoringOrders) return Promise.resolve(order ? [{ ...order }] : []);
            if (table === pushEvents) return Promise.resolve(pushRows.has(lastKey) ? [pushRows.get(lastKey)] : []);
            return Promise.resolve(rows.get(table) ?? []);
          },
        }),
      }),
    }),
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
    update: (table: unknown) => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          if (table === tailoringOrders) {
            return {
              returning: () => {
                if (opts.loseRace || !order) return Promise.resolve([]);
                updated.push(v);
                order.state = String(v.state);
                return Promise.resolve([{ id: order.id }]);
              },
            };
          }
          updated.push(v);
          const row = pushRows.get(lastKey);
          if (row && typeof v.status === "string") row.status = v.status;
          return Promise.resolve();
        },
      }),
    }),
    inserted,
    updated,
    order: () => order,
    selects: () => selects,
  };
  return db as unknown as Db & {
    inserted: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
    order(): { id: string; state: string } | null;
    selects(): number;
  };
}

function tailoringOpts(extra: Partial<Parameters<typeof processTailoringTransition>[2]> = {}) {
  return { now: NOON, enqueueNext: vi.fn(async () => undefined), ...extra };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("worker-gifts gift occasions", () => {
  it("registers gift and tailoring queue names", () => {
    expect(GIFT_OCCASION_QUEUE).toBe("gift-occasion");
    expect(TAILORING_QUEUE).toBe("tailoring-orders");
  });

  it("writes a gift_occasion push_events row with the recipient's current name", async () => {
    const db = mockDb({
      dates: [{ occasion: giftPayload.occasion, date: giftPayload.date, label: "Birthday" }],
    });
    const result = await processGiftOccasion({ ...giftPayload, recipientName: "Old name" }, db, { now: NOON });

    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]!.eventType).toBe("gift_occasion");
    expect(db.inserted[0]!.userId).toBe(giftPayload.userId);
    expect(db.inserted[0]!.dedupeKey).toBe(
      `gift-occasion:${giftPayload.recipientId}:${giftPayload.occasion}:${giftPayload.date}`,
    );
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.title).toMatch(/Birthday/);
    // No idea count in the payload: no number is claimed.
    expect(db.inserted[0]!.body).toBe("Time to pick a gift for Sam.");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: `worn://recipients?focus=${giftPayload.recipientId}`,
      screen: "recipients",
    });
  });

  it("sends the festival lead push with Diwali copy", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-diwali" }));
    const date = "2026-11-08T00:00:00.000Z";
    const db = mockDb({
      user: { pushToken: "ExponentPushToken[gift]" },
      recipient: { name: "Mom" },
      dates: [{ occasion: "FESTIVAL", date, label: "Diwali" }],
    });
    const result = await processGiftOccasion(
      { ...giftPayload, occasion: "FESTIVAL", date, label: "Diwali", ideaCount: 3 },
      db,
      { now: new Date("2026-10-27T12:00:00.000Z"), sendExpo },
    );
    expect(result.status).toBe("sent");
    expect(db.inserted[0]!.title).toBe("12 days to Diwali");
    expect(db.inserted[0]!.body).toBe("3 perfect gifts for Mom, all in budget.");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-diwali" });
  });

  it("delays gift pushes during the user's quiet hours", async () => {
    const db = mockDb();
    // 23:15 UTC is 04:45 IST.
    const result = await processGiftOccasion(giftPayload, db, { now: new Date("2026-08-26T23:15:00.000Z") });
    expect(result.status).toBe("delayed");
    expect(db.inserted).toHaveLength(0);
  });

  it("marks SENT when Expo delivers, and a rerun sends nothing", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-g1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[gift]" } });
    expect((await processGiftOccasion(giftPayload, db, { now: NOON, sendExpo })).status).toBe("sent");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-g1" });
    expect((await processGiftOccasion(giftPayload, db, { now: NOON, sendExpo })).status).toBe("skipped");
    expect(sendExpo).toHaveBeenCalledTimes(1);
    expect(db.inserted).toHaveLength(1);
  });

  it("skips a deleted recipient, an edited or removed date, and a missing user", async () => {
    for (const db of [
      mockDb({ recipient: null }),
      mockDb({ dates: null }),
      mockDb({ dates: [{ occasion: giftPayload.occasion, date: "2026-09-02" }] }),
      mockDb({ dates: [] }),
      mockDb({ user: null }),
    ]) {
      expect(await processGiftOccasion(giftPayload, db, { now: NOON })).toEqual({ status: "skipped" });
      expect(db.inserted).toHaveLength(0);
    }
  });
});

describe("worker-gifts tailoring ladder", () => {
  it("moves the order one step, schedules the next one and pushes human copy", async () => {
    const db = mockDb();
    const opts = tailoringOpts();
    const result = await processTailoringTransition(tailoringPayload, db, opts);

    expect(result.status).toBe("queued");
    expect(db.order()!.state).toBe("CONFIRMED");
    expect(opts.enqueueNext).toHaveBeenCalledWith(
      { orderId: tailoringPayload.orderId, userId: tailoringPayload.userId, toState: "IN_STITCHING" },
      { delay: 2 * 60 * 60 * 1000, jobId: `tailor%3A${tailoringPayload.orderId}%3AIN_STITCHING` },
    );
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      eventType: "tailoring_update",
      dedupeKey: `tailoring:${tailoringPayload.orderId}:CONFIRMED`,
      title: "Your tailor confirmed the order",
      body: "They'll start on it soon.",
    });
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: `worn://fit?order=${tailoringPayload.orderId}`,
      screen: "fit",
      state: "CONFIRMED",
    });
  });

  it("is safe to run twice: the rerun moves nothing and pushes nothing new", async () => {
    const db = mockDb();
    const opts = tailoringOpts();
    await processTailoringTransition(tailoringPayload, db, opts);
    await processTailoringTransition(tailoringPayload, db, opts);
    expect(db.updated.filter((u) => "state" in u)).toHaveLength(1);
    expect(db.inserted).toHaveLength(1);
    // The next job is re-added under the same id, which BullMQ ignores.
    expect(opts.enqueueNext).toHaveBeenCalledTimes(2);
    expect(vi.mocked(opts.enqueueNext).mock.calls[1]).toEqual(vi.mocked(opts.enqueueNext).mock.calls[0]);
  });

  it("drops a job for a step the order has already left", async () => {
    const db = mockDb({ order: { id: tailoringPayload.orderId, state: "SHIPPED" } });
    const opts = tailoringOpts();
    expect(await processTailoringTransition(tailoringPayload, db, opts)).toEqual({ status: "skipped" });
    expect(db.order()!.state).toBe("SHIPPED");
    expect(opts.enqueueNext).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });

  it("does nothing when another writer moved the order between the read and the move", async () => {
    const db = mockDb({ loseRace: true });
    const opts = tailoringOpts();
    expect(await processTailoringTransition(tailoringPayload, db, opts)).toEqual({ status: "skipped" });
    expect(opts.enqueueNext).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });

  it("skips a missing order and a delivered order", async () => {
    for (const db of [
      mockDb({ order: null }),
      mockDb({ order: { id: tailoringPayload.orderId, state: "DELIVERED" } }),
    ]) {
      const opts = tailoringOpts();
      expect(await processTailoringTransition({ ...tailoringPayload, toState: undefined }, db, opts)).toEqual({
        status: "skipped",
      });
      expect(opts.enqueueNext).not.toHaveBeenCalled();
      expect(db.updated).toHaveLength(0);
    }
  });

  it("moves the current step for a job queued before toState existed", async () => {
    const db = mockDb({ order: { id: tailoringPayload.orderId, state: "CONFIRMED" } });
    const opts = tailoringOpts();
    await processTailoringTransition({ orderId: tailoringPayload.orderId, userId: tailoringPayload.userId }, db, opts);
    expect(db.order()!.state).toBe("IN_STITCHING");
    expect(db.inserted[0]!.title).toBe("Your order is being stitched");
  });

  it("schedules nothing after the last step", async () => {
    const db = mockDb({ order: { id: tailoringPayload.orderId, state: "SHIPPED" } });
    const opts = tailoringOpts();
    await processTailoringTransition({ ...tailoringPayload, toState: "DELIVERED" }, db, opts);
    expect(db.order()!.state).toBe("DELIVERED");
    expect(opts.enqueueNext).not.toHaveBeenCalled();
    expect(db.inserted[0]!.title).toBe("Your tailored piece has arrived");
  });

  it("never runs the simulated ladder in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const db = mockDb();
    const opts = tailoringOpts();
    expect(await processTailoringTransition(tailoringPayload, db, opts)).toEqual({ status: "skipped" });
    expect(db.selects()).toBe(0);
    expect(opts.enqueueNext).not.toHaveBeenCalled();
  });

  it("marks SENT when Expo delivers", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-t1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[tailor]" } });
    const result = await processTailoringTransition(tailoringPayload, db, tailoringOpts({ sendExpo }));
    expect(result.status).toBe("sent");
    expect(db.updated.some((u) => u.status === "SENT" && u.expoTicketId === "ticket-t1")).toBe(true);
  });
});

describe("worker-gifts consumers", () => {
  it("runs in-memory gift jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryGiftWorker(handler, { autoProcess: false });
    await worker.start();
    await worker.enqueue(giftPayload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(giftPayload);
    await worker.stop();
  });

  it("runs in-memory tailoring jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryTailoringWorker(handler, { autoProcess: false });
    await worker.start();
    await worker.enqueue(tailoringPayload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(tailoringPayload);
    await worker.stop();
  });

  it("refuses to build a BullMQ worker without Redis or without a Db", () => {
    vi.stubEnv("REDIS_URL", "");
    expect(() => createBullmqGiftWorker()).toThrow(/REDIS_URL/);
    expect(() => createBullmqTailoringWorker()).toThrow(/REDIS_URL/);
    expect(() => createBullmqGiftWorker({ redisUrl: "redis://127.0.0.1:1" })).toThrow(/Db is required/);
    expect(() => createBullmqTailoringWorker({ redisUrl: "redis://127.0.0.1:1" })).toThrow(/Db is required/);
  });

  it.skipIf(!process.env.TEST_REDIS_URL)("builds the gift worker on a real Redis", async () => {
    const worker = createBullmqGiftWorker({ redisUrl: process.env.TEST_REDIS_URL, db: mockDb() });
    expect(worker.worker.name).toBe(GIFT_OCCASION_QUEUE);
    await worker.stop();
  });

  it.skipIf(!process.env.TEST_REDIS_URL)(
    "a tailoring job on a real Redis moves the order and queues the next step once",
    async () => {
      const connection = new Redis(process.env.TEST_REDIS_URL!, { maxRetriesPerRequest: null });
      const queue = new Queue<TailoringPayload>(TAILORING_QUEUE, { connection });
      await queue.obliterate({ force: true });
      const db = mockDb();
      const consumer = createBullmqTailoringWorker({ connection, db });
      try {
        await consumer.start();
        const done = new Promise<void>((resolve) => consumer.worker.once("completed", () => resolve()));
        await queue.add(TAILORING_JOB, tailoringPayload, { jobId: "tailor-e2e-first" });
        await done;
        expect(db.order()!.state).toBe("CONFIRMED");
        const delayed = await queue.getDelayed();
        expect(delayed.map((job) => [job.id, job.data.toState])).toEqual([
          [`tailor%3A${tailoringPayload.orderId}%3AIN_STITCHING`, "IN_STITCHING"],
        ]);
        expect(delayed[0]!.opts.attempts).toBe(3);
      } finally {
        await consumer.stop();
        await queue.obliterate({ force: true });
        await queue.close();
        await connection.quit();
      }
    },
  );
});
