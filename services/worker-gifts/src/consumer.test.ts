import { describe, expect, it, vi } from "vitest";
import {
  createBullmqGiftWorker,
  createMemoryGiftWorker,
  createMemoryTailoringWorker,
  GIFT_OCCASION_QUEUE,
  TAILORING_QUEUE,
  processGiftOccasion,
  processTailoringTransition,
} from "./index.js";
import type { GiftOccasionPayload, TailoringPayload } from "./index.js";
import type { Db } from "@worn/db";

const giftPayload: GiftOccasionPayload = {
  userId: "00000000-0000-4000-8000-0000000000b1",
  recipientId: "00000000-0000-4000-8000-0000000000c1",
  occasion: "birthday",
  date: "2026-09-01",
};

const tailoringPayload: TailoringPayload = {
  orderId: "00000000-0000-4000-8000-0000000000t1",
  userId: "00000000-0000-4000-8000-0000000000b1",
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockUserDb(opts: {
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

describe("worker-gifts queue", () => {
  it("registers gift and tailoring queue names", () => {
    expect(GIFT_OCCASION_QUEUE).toBe("gift-occasion");
    expect(TAILORING_QUEUE).toBe("tailoring-orders");
  });

  it("processGiftOccasion writes a gift_occasion push_events row with deep link", async () => {
    const db = mockUserDb();
    const result = await processGiftOccasion(
      { ...giftPayload, label: "Birthday", recipientName: "Sam" },
      db,
      { now: NOON },
    );

    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]!.eventType).toBe("gift_occasion");
    expect(db.inserted[0]!.userId).toBe(giftPayload.userId);
    expect(db.inserted[0]!.dedupeKey).toBe(
      `gift-occasion:${giftPayload.recipientId}:${giftPayload.occasion}:${giftPayload.date}`,
    );
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.title).toMatch(/Birthday|birthday/i);
    expect(db.inserted[0]!.body).toContain("perfect gifts");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: `worn://recipients?focus=${giftPayload.recipientId}`,
      screen: "recipients",
    });
  });

  it("enqueue festival lead push marks SENT with Diwali copy", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-diwali" }));
    const db = mockUserDb({ user: { pushToken: "ExponentPushToken[gift]" } });
    const result = await processGiftOccasion(
      {
        userId: giftPayload.userId,
        recipientId: giftPayload.recipientId,
        occasion: "FESTIVAL",
        date: "2026-11-08T00:00:00.000Z",
        label: "Diwali",
        recipientName: "Mom",
        ideaCount: 3,
      },
      db,
      { now: new Date("2026-10-27T12:00:00.000Z"), sendExpo },
    );
    expect(result.status).toBe("sent");
    expect(db.inserted[0]!.title).toBe("12 days to Diwali");
    expect(db.inserted[0]!.body).toBe("3 perfect gifts for Mom, all in budget.");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-diwali" });
  });

  it("delays gift pushes during quiet hours", async () => {
    const db = mockUserDb();
    const result = await processGiftOccasion(giftPayload, db, {
      now: new Date("2026-08-26T23:15:00.000Z"),
    });
    expect(result.status).toBe("delayed");
    expect(db.inserted).toHaveLength(0);
  });

  it("enqueue → send mock marks SENT", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-g1" }));
    const db = mockUserDb({ user: { pushToken: "ExponentPushToken[gift]" } });
    const result = await processGiftOccasion(giftPayload, db, { now: NOON, sendExpo });
    expect(result.status).toBe("sent");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-g1" });
  });

  it("processTailoringTransition advances state and enqueues a push", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserted: Array<Record<string, unknown>> = [];
    const order = {
      id: tailoringPayload.orderId,
      userId: tailoringPayload.userId,
      state: "PENDING",
    };
    let selectCall = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              selectCall += 1;
              if (selectCall === 1) return Promise.resolve([order]);
              return Promise.resolve([{ consentFlags: {}, pushToken: null }]);
            },
          }),
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => {
            updates.push(v);
            return Promise.resolve();
          },
        }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return Promise.resolve();
        },
      }),
    } as unknown as Db;

    await processTailoringTransition(tailoringPayload, db, { now: NOON });

    expect(updates.some((u) => u.state === "CONFIRMED")).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.eventType).toBe("tailoring_update");
    expect(inserted[0]!.dedupeKey).toBe(`tailoring:${order.id}:CONFIRMED`);
    expect(inserted[0]!.payload).toMatchObject({
      deepLink: `worn://fit?order=${order.id}`,
      screen: "fit",
    });
  });

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

  it("exposes a BullMQ gift scaffold that needs Redis to start", async () => {
    expect(() => createBullmqGiftWorker()).toThrow(/REDIS_URL/);
    const worker = createBullmqGiftWorker({
      redisUrl: "redis://localhost:6379",
    });
    expect(worker.worker.name).toBe(GIFT_OCCASION_QUEUE);
    await worker.stop();
  });

  it("processTailoringTransition no-ops when order missing or terminal", async () => {
    const dbMissing = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      insert: () => ({ values: async () => undefined }),
    } as unknown as Db;
    expect(await processTailoringTransition(tailoringPayload, dbMissing, { now: NOON })).toBeUndefined();

    const updates: unknown[] = [];
    const dbTerminal = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: tailoringPayload.orderId,
                userId: tailoringPayload.userId,
                state: "DELIVERED",
              },
            ],
          }),
        }),
      }),
      update: () => ({
        set: (v: unknown) => ({
          where: async () => {
            updates.push(v);
          },
        }),
      }),
      insert: () => ({ values: async () => undefined }),
    } as unknown as Db;
    expect(await processTailoringTransition(tailoringPayload, dbTerminal, { now: NOON })).toBeUndefined();
    expect(updates).toHaveLength(0);
  });

  it("processTailoringTransition marks SENT when Expo delivers", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const order = {
      id: tailoringPayload.orderId,
      userId: tailoringPayload.userId,
      state: "CONFIRMED",
    };
    let selectCall = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              selectCall += 1;
              if (selectCall === 1) return Promise.resolve([order]);
              return Promise.resolve([
                { consentFlags: {}, pushToken: "ExponentPushToken[tailor]" },
              ]);
            },
          }),
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => {
            updates.push(v);
            return Promise.resolve();
          },
        }),
      }),
      insert: () => ({
        values: async () => undefined,
      }),
    } as unknown as Db;

    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-t1" }));
    const result = await processTailoringTransition(tailoringPayload, db, {
      now: NOON,
      sendExpo,
    });
    expect(result?.status).toBe("sent");
    expect(updates.some((u) => u.state === "IN_STITCHING")).toBe(true);
    expect(updates.some((u) => u.status === "SENT" && u.expoTicketId === "ticket-t1")).toBe(
      true,
    );
  });
});
