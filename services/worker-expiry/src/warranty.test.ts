import { describe, expect, it, vi } from "vitest";
import {
  createMemoryWarrantyWorker,
  WARRANTY_EXPIRY_QUEUE,
  processWarrantyExpiry,
  WARRANTY_EXPIRY_EVENT,
} from "./index.js";
import type { WarrantyExpiryPayload } from "./index.js";
import { warranties } from "@worn/db";
import { mockDb as mockTables, type MockUser } from "./mock-db.test-helper.js";

const payload: WarrantyExpiryPayload = {
  warrantyId: "00000000-0000-4000-8000-0000000000c1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  itemTitle: "Denim Jeans",
  provider: "Mock Mart",
  coverageUntil: new Date(Date.now() + 86_400_000).toISOString(),
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockDb(opts: { user?: MockUser; warranty?: { coverageUntil: Date } | null } = {}) {
  const warrantyRows =
    opts.warranty === null ? [] : [opts.warranty ?? { coverageUntil: new Date(payload.coverageUntil) }];
  return mockTables(opts.user, [[warranties, warrantyRows]]);
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
    expect(db.inserted[0]!.dedupeKey).toBe(
      `warranty-expiry:${payload.warrantyId}:${payload.coverageUntil}`,
    );
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.payload).toMatchObject({
      deepLink: "worn://vault?focus=warranty",
      screen: "vault",
    });
  });

  it("skips when warranty category is opted out", async () => {
    const db = mockDb({
      user: {
        prefs: {
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

  it("skips a deleted warranty, a changed coverage end and a missing user", async () => {
    for (const db of [
      mockDb({ warranty: null }),
      mockDb({ warranty: { coverageUntil: new Date(Date.parse(payload.coverageUntil) + 86_400_000) } }),
      mockDb({ user: null }),
    ]) {
      expect(await processWarrantyExpiry(payload, db, { now: NOON })).toEqual({ status: "skipped" });
      expect(db.inserted).toHaveLength(0);
    }
  });
});
