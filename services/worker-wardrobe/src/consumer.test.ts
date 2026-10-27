import { describe, expect, it, vi } from "vitest";
import {
  createBullmqWardrobeWorker,
  createMemoryWardrobeWorker,
  OUTFIT_QUEUE,
  OUTFIT_EVENT,
  DRY_CLEAN_QUEUE,
  DRY_CLEAN_PICKUP_EVENT,
  processOutfit,
  processDryCleanPickupJob,
} from "./index.js";
import type { OutfitPayload } from "./index.js";
import type { Db } from "@worn/db";

const payload: OutfitPayload = {
  userId: "00000000-0000-4000-8000-0000000000a1",
  trigger: "nightly",
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockSelectDb(opts: {
  user?: {
    id: string;
    styleProfile: unknown;
    consentFlags?: Record<string, unknown>;
    pushToken?: string | null;
  } | null;
  items?: Array<{ id: string; userId: string; category: string; colors: string[] }>;
  onInsert?: (values: Record<string, unknown>) => void;
  onUpdate?: (values: Record<string, unknown>) => void;
}): Db & { inserted: Array<Record<string, unknown>>; updated: Array<Record<string, unknown>> } {
  let selectCall = 0;
  const items = opts.items ?? [];
  const userRows = opts.user ? [opts.user] : [];
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];

  return {
    select: () => ({
      from: () => ({
        where: () => {
          selectCall += 1;
          if (selectCall === 1) {
            return Object.assign(Promise.resolve(userRows), {
              limit: () => Promise.resolve(userRows),
            });
          }
          return Promise.resolve(items);
        },
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        opts.onInsert?.(v);
        return Object.assign(Promise.resolve(), {
          returning: async () => [v],
        });
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated.push(v);
          opts.onUpdate?.(v);
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

describe("worker-wardrobe queue", () => {
  it("registers the outfit-generation queue name", () => {
    expect(OUTFIT_QUEUE).toBe("outfit-generation");
  });

  it("processOutfit inserts an outfit and OUTFIT_READY push event", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = mockSelectDb({
      user: {
        id: payload.userId,
        styleProfile: { tags: ["top"] },
        consentFlags: {},
        pushToken: null,
      },
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000i1",
          userId: payload.userId,
          category: "top",
          colors: ["blue"],
        },
        {
          id: "00000000-0000-4000-8000-0000000000i2",
          userId: payload.userId,
          category: "bottom",
          colors: ["black"],
        },
      ],
      onInsert: (v) => inserted.push(v),
    });

    const { outfitId, push } = await processOutfit(payload, db, { now: NOON });

    expect(outfitId).toBeTruthy();
    expect(push?.status).toBe("queued");
    expect(inserted.length).toBeGreaterThanOrEqual(2);
    const pushRow = inserted.find((row) => row.eventType === OUTFIT_EVENT);
    expect(pushRow).toBeDefined();
    expect(pushRow!.userId).toBe(payload.userId);
    expect(pushRow!.status).toBe("QUEUED");
    expect(String(pushRow!.dedupeKey)).toMatch(/^outfit:/);
    expect(pushRow!.payload).toMatchObject({
      deepLink: "worn://today?focus=outfit",
      screen: "today",
    });
  });

  it("skips outfit push when outfits category is opted out", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = mockSelectDb({
      user: {
        id: payload.userId,
        styleProfile: null,
        consentFlags: {
          notifications: {
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            categories: {
              returns: true,
              warranty: true,
              credits: true,
              outfits: false,
            },
          },
        },
        pushToken: null,
      },
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000i1",
          userId: payload.userId,
          category: "top",
          colors: ["blue"],
        },
      ],
      onInsert: (v) => inserted.push(v),
    });

    const { outfitId, push } = await processOutfit(payload, db, { now: NOON });
    expect(outfitId).toBeTruthy();
    expect(push).toEqual({ status: "skipped" });
    expect(inserted.find((r) => r.eventType === OUTFIT_EVENT)).toBeUndefined();
  });

  it("delays outfit generation during quiet hours without inserting", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = mockSelectDb({
      user: {
        id: payload.userId,
        styleProfile: null,
        consentFlags: {},
        pushToken: null,
      },
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000i1",
          userId: payload.userId,
          category: "top",
          colors: ["blue"],
        },
      ],
      onInsert: (v) => inserted.push(v),
    });

    const result = await processOutfit(payload, db, {
      now: new Date("2026-08-26T23:00:00.000Z"),
    });
    expect(result.outfitId).toBeNull();
    expect(result.push?.status).toBe("delayed");
    expect(inserted).toHaveLength(0);
  });

  it("processOutfit returns null outfit when the wardrobe is empty", async () => {
    const db = mockSelectDb({
      user: { id: payload.userId, styleProfile: null },
      items: [],
    });
    await expect(processOutfit(payload, db, { now: NOON })).resolves.toEqual({
      outfitId: null,
    });
  });

  it("runs in-memory jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryWardrobeWorker(handler, { autoProcess: false });
    expect(worker.queue).toBe(OUTFIT_QUEUE);

    await worker.start();
    await worker.enqueue(payload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(payload);
    await worker.stop();
  });

  it("delivers SENT via mock Expo sender when pushToken is set", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const updated: Array<Record<string, unknown>> = [];
    const db = mockSelectDb({
      user: {
        id: payload.userId,
        styleProfile: null,
        consentFlags: {},
        pushToken: "ExponentPushToken[test-token]",
      },
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000i1",
          userId: payload.userId,
          category: "top",
          colors: ["blue"],
        },
      ],
      onInsert: (v) => inserted.push(v),
      onUpdate: (v) => updated.push(v),
    });

    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-mock-1" }));
    const { outfitId, push } = await processOutfit(payload, db, { now: NOON, sendExpo });

    expect(outfitId).toBeTruthy();
    expect(push?.status).toBe("sent");
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ExponentPushToken[test-token]",
        title: "Your outfit for today is ready",
        data: expect.objectContaining({ deepLink: "worn://today?focus=outfit", screen: "today" }),
      }),
    );
    expect(updated.some((u) => u.status === "SENT")).toBe(true);
  });

  it("exposes a BullMQ scaffold that needs Redis to start", async () => {
    expect(() => createBullmqWardrobeWorker()).toThrow(/REDIS_URL/);
    const worker = createBullmqWardrobeWorker({
      redisUrl: "redis://localhost:6379",
    });
    expect(worker.worker.name).toBe(OUTFIT_QUEUE);
    expect(worker.dryCleanWorker.name).toBe(DRY_CLEAN_QUEUE);
    await worker.stop();
  });

  it("registers dry-clean-pickup queue name", () => {
    expect(DRY_CLEAN_QUEUE).toBe("dry-clean-pickup");
    expect(DRY_CLEAN_PICKUP_EVENT).toBe("DRY_CLEAN_PICKUP");
  });

  it("processDryCleanPickupJob queues day-of push when item is at cleaner", async () => {
    const userId = "00000000-0000-4000-8000-0000000000a1";
    const itemId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const inserted: Array<Record<string, unknown>> = [];
    let selectCall = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCall += 1;
            if (selectCall === 1) {
              return Object.assign(
                Promise.resolve([
                  {
                    id: itemId,
                    userId,
                    category: "blazer",
                    dryCleanTicket: "DC-9",
                    laundryStatus: "IN_LAUNDRY",
                  },
                ]),
                {
                  limit: () =>
                    Promise.resolve([
                      {
                        id: itemId,
                        userId,
                        category: "blazer",
                        dryCleanTicket: "DC-9",
                        laundryStatus: "IN_LAUNDRY",
                      },
                    ]),
                },
              );
            }
            return Object.assign(
              Promise.resolve([
                {
                  id: userId,
                  consentFlags: {},
                  pushToken: null,
                },
              ]),
              {
                limit: () =>
                  Promise.resolve([{ id: userId, consentFlags: {}, pushToken: null }]),
              },
            );
          },
        }),
      }),
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
    } as unknown as Db;

    const result = await processDryCleanPickupJob(
      {
        userId,
        wardrobeItemId: itemId,
        ticket: "DC-9",
        pickupOn: "2026-08-28",
        category: "blazer",
      },
      db,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(inserted[0]?.eventType).toBe(DRY_CLEAN_PICKUP_EVENT);
    expect(String(inserted[0]?.dedupeKey)).toBe(`dryclean:${itemId}:2026-08-28`);
  });

  it("processDryCleanPickupJob skips when item missing or not at cleaner", async () => {
    const userId = payload.userId;
    const itemId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const dbMissing = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as unknown as Db;
    expect(
      await processDryCleanPickupJob(
        { userId, wardrobeItemId: itemId, ticket: "T1", pickupOn: "2026-08-28" },
        dbMissing,
        { now: NOON },
      ),
    ).toEqual({ status: "skipped", reason: "not_found" });

    const dbClean = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: itemId,
                userId,
                category: "coat",
                dryCleanTicket: null,
                laundryStatus: "CLEAN",
              },
            ],
          }),
        }),
      }),
    } as unknown as Db;
    expect(
      await processDryCleanPickupJob(
        { userId, wardrobeItemId: itemId, ticket: "T1", pickupOn: "2026-08-28" },
        dbClean,
        { now: NOON },
      ),
    ).toEqual({ status: "skipped", reason: "not_at_cleaner" });
  });

  it("processDryCleanPickupJob delays during quiet hours and skips category opt-out", async () => {
    const userId = payload.userId;
    const itemId = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    const item = {
      id: itemId,
      userId,
      category: "blazer",
      dryCleanTicket: "DC-1",
      laundryStatus: "IN_LAUNDRY",
    };

    function dbWithUser(user: Record<string, unknown>) {
      let selectCall = 0;
      return {
        select: () => ({
          from: () => ({
            where: () => {
              selectCall += 1;
              if (selectCall === 1) {
                return Object.assign(Promise.resolve([item]), {
                  limit: async () => [item],
                });
              }
              return Object.assign(Promise.resolve([user]), {
                limit: async () => [user],
              });
            },
          }),
        }),
        insert: () => ({ values: async () => undefined }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      } as unknown as Db;
    }

    const delayed = await processDryCleanPickupJob(
      { userId, wardrobeItemId: itemId, ticket: "DC-1", pickupOn: "2026-08-28" },
      dbWithUser({ id: userId, consentFlags: {}, pushToken: null }),
      { now: new Date("2026-08-26T23:00:00.000Z") },
    );
    expect(delayed.status).toBe("delayed");

    const skipped = await processDryCleanPickupJob(
      { userId, wardrobeItemId: itemId, ticket: "DC-1", pickupOn: "2026-08-28" },
      dbWithUser({
        id: userId,
        consentFlags: {
          notifications: {
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            categories: { outfits: false, returns: true, warranty: true, credits: true },
          },
        },
        pushToken: null,
      }),
      { now: NOON },
    );
    // DRY_CLEAN_PICKUP maps to outfits category in shared gate
    expect(skipped.status).toBe("skipped");
  });

  it("processDryCleanPickupJob marks SENT when Expo delivers", async () => {
    const userId = payload.userId;
    const itemId = "cccccccc-dddd-eeee-ffff-000000000001";
    const item = {
      id: itemId,
      userId,
      category: "coat",
      dryCleanTicket: "DC-SENT",
      laundryStatus: "IN_LAUNDRY",
    };
    const updated: Array<Record<string, unknown>> = [];
    let selectCall = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCall += 1;
            if (selectCall === 1) {
              return Object.assign(Promise.resolve([item]), {
                limit: async () => [item],
              });
            }
            return Object.assign(
              Promise.resolve([
                {
                  id: userId,
                  consentFlags: {},
                  pushToken: "ExponentPushToken[dc]",
                },
              ]),
              {
                limit: async () => [
                  { id: userId, consentFlags: {}, pushToken: "ExponentPushToken[dc]" },
                ],
              },
            );
          },
        }),
      }),
      insert: () => ({
        values: async () => undefined,
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            updated.push(v);
          },
        }),
      }),
    } as unknown as Db;

    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-dc" }));
    const result = await processDryCleanPickupJob(
      {
        userId,
        wardrobeItemId: itemId,
        ticket: "DC-SENT",
        pickupOn: "2026-08-29",
        category: "coat",
      },
      db,
      { now: NOON, sendExpo },
    );
    expect(result.status).toBe("sent");
    expect(updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-dc" });
  });
});
