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
import type { DryCleanPickupPayload, OutfitPayload } from "./index.js";
import { outfits, pushEvents, users, wardrobeItems, type Db } from "@worn/db";

const payload: OutfitPayload = {
  userId: "00000000-0000-4000-8000-0000000000a1",
  trigger: "morning",
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

const TOP = { id: "00000000-0000-4000-8000-0000000000e1", category: "top", colors: ["blue"] };
const BOTTOM = { id: "00000000-0000-4000-8000-0000000000e2", category: "bottom", colors: ["black"] };

type MockUser = {
  prefs?: Record<string, unknown>;
  timeZone?: string;
  pushToken?: string | null;
  styleProfile?: unknown;
} | null;

/**
 * A Db stand-in routed by table. Outfits keep one row per day (like the unique index on
 * user + planned_for) and push_events one row per dedupe key, so reruns can be tested.
 */
function mockDb(
  opts: {
    user?: MockUser;
    items?: Array<Record<string, unknown>>;
    planned?: { id: string; itemIds: string[] };
    /** Another run plans the day between this run's read and its insert. */
    loseRace?: boolean;
  } = {},
) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const userRows =
    opts.user === null
      ? []
      : [
          {
            prefs: opts.user?.prefs ?? {},
            timeZone: opts.user?.timeZone ?? "Asia/Kolkata",
            pushToken: opts.user?.pushToken ?? null,
            styleProfile: opts.user?.styleProfile ?? null,
          },
        ];
  let dayOutfit: { id: string; itemIds: string[] } | null = opts.planned ?? null;
  const pushRows = new Map<string, { id: string; status: string }>();
  let lastKey = "";

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            if (table === users) return Promise.resolve(userRows);
            if (table === outfits) return Promise.resolve(dayOutfit ? [dayOutfit] : []);
            if (table === wardrobeItems) return Promise.resolve(opts.items ?? []);
            if (table === pushEvents) return Promise.resolve(pushRows.has(lastKey) ? [pushRows.get(lastKey)] : []);
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            if (table === outfits) {
              if (opts.loseRace && !dayOutfit) dayOutfit = { id: "outfit-winner", itemIds: [TOP.id] };
              if (dayOutfit) return Promise.resolve([]);
              inserted.push({ table: "outfits", ...v });
              dayOutfit = { id: "outfit-1", itemIds: v.itemIds as string[] };
              return Promise.resolve([{ id: dayOutfit.id }]);
            }
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

const outfitRows = (db: { inserted: Array<Record<string, unknown>> }) =>
  db.inserted.filter((row) => row.table === "outfits");
const pushRowsOf = (db: { inserted: Array<Record<string, unknown>> }) =>
  db.inserted.filter((row) => row.table !== "outfits");

describe("worker-wardrobe outfits", () => {
  it("registers the outfit-generation queue name", () => {
    expect(OUTFIT_QUEUE).toBe("outfit-generation");
  });

  it("plans today's outfit with no invented weather and queues an OUTFIT_READY push", async () => {
    const db = mockDb({ user: { styleProfile: { tags: ["top"] } }, items: [TOP, BOTTOM] });
    const { outfitId, push } = await processOutfit(payload, db, { now: NOON });

    expect(outfitId).toBe("outfit-1");
    expect(push?.status).toBe("queued");
    expect(outfitRows(db)).toHaveLength(1);
    expect(outfitRows(db)[0]).toMatchObject({ plannedFor: "2026-08-26", weatherCtx: null, itemIds: [TOP.id, BOTTOM.id] });
    const [row] = pushRowsOf(db);
    expect(row).toMatchObject({
      eventType: OUTFIT_EVENT,
      userId: payload.userId,
      status: "QUEUED",
      dedupeKey: "outfit:outfit-1",
      body: "We picked top, bottom for today.",
    });
    expect(String(row!.body)).not.toMatch(/weather/i);
    expect(row!.payload).toMatchObject({ deepLink: "worn://today?focus=outfit", screen: "today" });
  });

  it("plans for the user's local day, not the server's", async () => {
    // 19:00 UTC on the 26th is 00:30 IST on the 27th (quiet hours moved out of the way).
    const db = mockDb({
      user: { prefs: { notifications: { quietHoursStart: "03:00", quietHoursEnd: "04:00" } } },
      items: [TOP],
    });
    await processOutfit(payload, db, { now: new Date("2026-08-26T19:00:00.000Z") });
    expect(outfitRows(db)[0]!.plannedFor).toBe("2026-08-27");
  });

  it("is safe to run twice: one outfit and one push for the day", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-o1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[o]" }, items: [TOP, BOTTOM] });
    expect((await processOutfit(payload, db, { now: NOON, sendExpo })).push?.status).toBe("sent");
    const rerun = await processOutfit(payload, db, { now: NOON, sendExpo });
    expect(rerun).toEqual({ outfitId: "outfit-1", push: { status: "skipped" } });
    expect(outfitRows(db)).toHaveLength(1);
    expect(pushRowsOf(db)).toHaveLength(1);
    expect(sendExpo).toHaveBeenCalledTimes(1);
  });

  it("keeps an outfit the user already planned for today", async () => {
    const db = mockDb({ items: [BOTTOM], planned: { id: "outfit-mine", itemIds: [BOTTOM.id] } });
    const { outfitId } = await processOutfit(payload, db, { now: NOON });
    expect(outfitId).toBe("outfit-mine");
    expect(outfitRows(db)).toHaveLength(0);
    expect(pushRowsOf(db)[0]).toMatchObject({ dedupeKey: "outfit:outfit-mine", body: "We picked bottom for today." });
  });

  it("uses the other run's outfit when it planned the day first", async () => {
    const db = mockDb({ items: [TOP], loseRace: true });
    const { outfitId } = await processOutfit(payload, db, { now: NOON });
    expect(outfitId).toBe("outfit-winner");
    expect(outfitRows(db)).toHaveLength(0);
    expect(pushRowsOf(db)[0]!.dedupeKey).toBe("outfit:outfit-winner");
  });

  it("skips outfit push when outfits category is opted out", async () => {
    const db = mockDb({
      user: {
        prefs: {
          notifications: {
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            categories: { returns: true, warranty: true, credits: true, outfits: false },
          },
        },
      },
      items: [TOP],
    });
    const { outfitId, push } = await processOutfit(payload, db, { now: NOON });
    expect(outfitId).toBe("outfit-1");
    expect(push).toEqual({ status: "skipped" });
    expect(pushRowsOf(db)).toHaveLength(0);
  });

  it("delays outfit generation during the user's quiet hours without inserting", async () => {
    const db = mockDb({ items: [TOP] });
    // 23:00 UTC is 04:30 IST.
    const result = await processOutfit(payload, db, { now: new Date("2026-08-26T23:00:00.000Z") });
    expect(result.outfitId).toBeNull();
    expect(result.push?.status).toBe("delayed");
    expect(db.inserted).toHaveLength(0);
  });

  it("returns no outfit for an empty wardrobe or a deleted user", async () => {
    for (const db of [mockDb({ items: [] }), mockDb({ user: null, items: [TOP] })]) {
      await expect(processOutfit(payload, db, { now: NOON })).resolves.toEqual({ outfitId: null });
      expect(db.inserted).toHaveLength(0);
    }
  });

  it("delivers SENT via mock Expo sender when pushToken is set", async () => {
    const db = mockDb({ user: { pushToken: "ExponentPushToken[test-token]" }, items: [TOP] });
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-mock-1" }));
    const { push } = await processOutfit(payload, db, { now: NOON, sendExpo });

    expect(push?.status).toBe("sent");
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ExponentPushToken[test-token]",
        title: "Your outfit for today is ready",
        data: expect.objectContaining({ deepLink: "worn://today?focus=outfit", screen: "today" }),
      }),
    );
    expect(db.updated.some((u) => u.status === "SENT")).toBe(true);
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

  it("refuses to build a BullMQ worker without Redis or without a Db", () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      expect(() => createBullmqWardrobeWorker()).toThrow(/REDIS_URL/);
    } finally {
      if (prev !== undefined) process.env.REDIS_URL = prev;
    }
    expect(() => createBullmqWardrobeWorker({ redisUrl: "redis://127.0.0.1:1" })).toThrow(/Db is required/);
  });

  it.skipIf(!process.env.TEST_REDIS_URL)("builds both BullMQ workers on a real Redis", async () => {
    const worker = createBullmqWardrobeWorker({ redisUrl: process.env.TEST_REDIS_URL, db: mockDb() });
    expect(worker.worker.name).toBe(OUTFIT_QUEUE);
    expect(worker.dryCleanWorker.name).toBe(DRY_CLEAN_QUEUE);
    await worker.stop();
  });
});

describe("worker-wardrobe dry-clean pickups", () => {
  const itemId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const job: DryCleanPickupPayload = {
    userId: payload.userId,
    wardrobeItemId: itemId,
    ticket: "DC-9",
    pickupOn: "2026-08-28",
    category: "blazer",
  };
  const atCleaner = {
    category: "blazer",
    dryCleanTicket: "DC-9",
    dryCleanPickupOn: "2026-08-28",
    laundryStatus: "IN_LAUNDRY",
  };

  it("registers dry-clean-pickup queue name", () => {
    expect(DRY_CLEAN_QUEUE).toBe("dry-clean-pickup");
    expect(DRY_CLEAN_PICKUP_EVENT).toBe("DRY_CLEAN_PICKUP");
  });

  it("queues the day-of push when the item is still at the cleaner", async () => {
    const db = mockDb({ items: [atCleaner] });
    const result = await processDryCleanPickupJob(job, db, { now: NOON });
    expect(result.status).toBe("queued");
    expect(db.inserted[0]).toMatchObject({
      eventType: DRY_CLEAN_PICKUP_EVENT,
      dedupeKey: `dryclean:${itemId}:2026-08-28`,
      body: "Ticket DC-9 · blazer ready for pickup",
    });
  });

  it("skips an item that is gone, collected, moved to another day, or whose owner is gone", async () => {
    const cases: Array<[ReturnType<typeof mockDb>, string]> = [
      [mockDb({ items: [] }), "not_found"],
      [mockDb({ items: [{ ...atCleaner, laundryStatus: "CLEAN" }] }), "not_at_cleaner"],
      [mockDb({ items: [{ ...atCleaner, dryCleanTicket: " " }] }), "not_at_cleaner"],
      [mockDb({ items: [{ ...atCleaner, dryCleanPickupOn: "2026-08-30" }] }), "rescheduled"],
      [mockDb({ items: [atCleaner], user: null }), "user_gone"],
    ];
    for (const [db, reason] of cases) {
      expect(await processDryCleanPickupJob(job, db, { now: NOON })).toEqual({ status: "skipped", reason });
      expect(db.inserted).toHaveLength(0);
    }
  });

  it("delays during quiet hours and skips a category opt-out", async () => {
    const delayed = await processDryCleanPickupJob(job, mockDb({ items: [atCleaner] }), {
      now: new Date("2026-08-26T23:00:00.000Z"),
    });
    expect(delayed.status).toBe("delayed");

    const optedOut = mockDb({
      items: [atCleaner],
      user: {
        prefs: {
          notifications: {
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            categories: { outfits: false, returns: true, warranty: true, credits: true },
          },
        },
      },
    });
    // DRY_CLEAN_PICKUP maps to outfits category in shared gate
    expect((await processDryCleanPickupJob(job, optedOut, { now: NOON })).status).toBe("skipped");
  });

  it("marks SENT when Expo delivers, and a rerun sends nothing", async () => {
    const db = mockDb({ items: [atCleaner], user: { pushToken: "ExponentPushToken[dc]" } });
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-dc" }));
    expect((await processDryCleanPickupJob(job, db, { now: NOON, sendExpo })).status).toBe("sent");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-dc" });
    expect((await processDryCleanPickupJob(job, db, { now: NOON, sendExpo })).status).toBe("skipped");
    expect(sendExpo).toHaveBeenCalledTimes(1);
  });
});
