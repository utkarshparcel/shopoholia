import { describe, expect, it, vi } from "vitest";
import {
  createMemoryWarrantyWorker,
  WARRANTY_EXPIRY_QUEUE,
  processWarrantyExpiry,
  WARRANTY_EXPIRY_EVENT,
} from "./index.js";
import type { WarrantyExpiryPayload } from "./index.js";
import type { Db } from "@worn/db";

const payload: WarrantyExpiryPayload = {
  warrantyId: "00000000-0000-4000-8000-0000000000c1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  itemTitle: "Denim Jeans",
  provider: "Mock Mart",
  coverageUntil: new Date(Date.now() + 86_400_000).toISOString(),
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

describe("worker-expiry warranty queue", () => {
  it("registers the warranty-expiry queue name", () => {
    expect(WARRANTY_EXPIRY_QUEUE).toBe("warranty-expiry");
  });

  it("processWarrantyExpiry writes a WARRANTY_EXPIRY push_events row", async () => {
    const db = mockDb();
    const result = await processWarrantyExpiry(payload, db, { now: NOON });

    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]!.eventType).toBe(WARRANTY_EXPIRY_EVENT);
    expect(db.inserted[0]!.userId).toBe(payload.userId);
    expect(db.inserted[0]!.dedupeKey).toBe(`warranty-expiry:${payload.warrantyId}`);
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: "worn://vault?focus=warranty",
      screen: "vault",
    });
  });

  it("skips when warranty category is opted out", async () => {
    const db = mockDb({
      user: {
        consentFlags: {
          notifications: {
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            categories: {
              returns: true,
              warranty: false,
              credits: true,
              outfits: true,
            },
          },
        },
      },
    });
    const result = await processWarrantyExpiry(payload, db, { now: NOON });
    expect(result).toEqual({ status: "skipped" });
    expect(db.inserted).toHaveLength(0);
  });

  it("runs in-memory warranty jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryWarrantyWorker(handler, { autoProcess: false });
    expect(worker.queue).toBe(WARRANTY_EXPIRY_QUEUE);

    await worker.start();
    await worker.enqueue(payload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(payload);
    await worker.stop();
  });

  it("enqueue → send mock marks SENT for warranty", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-w1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[warranty]" } });
    const result = await processWarrantyExpiry(payload, db, { now: NOON, sendExpo });
    expect(result.status).toBe("sent");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-w1" });
  });
});
