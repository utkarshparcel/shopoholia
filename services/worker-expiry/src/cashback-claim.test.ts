import { describe, expect, it, vi } from "vitest";
import {
  CASHBACK_CLAIM_DEADLINE_EVENT,
  CASHBACK_CLAIM_QUEUE,
  createBullmqCashbackClaimWorker,
  createMemoryCashbackClaimWorker,
  processCashbackClaimDeadline,
} from "./index.js";
import type { CashbackClaimDeadlinePayload } from "./index.js";
import { cashbackClaims } from "@worn/db";
import { mockDb as mockTables, type MockUser } from "./mock-db.test-helper.js";

const payload: CashbackClaimDeadlinePayload = {
  claimId: "00000000-0000-4000-8000-0000000000c1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  source: "HDFC Swiggy",
  merchant: "Myntra",
  amountMinor: 25_000,
  currency: "INR",
  expiresAt: "2026-09-01T00:00:00.000Z",
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockDb(opts: { claim?: { status: string } | null; user?: MockUser } = {}) {
  const claimRows =
    opts.claim === null ? [] : [{ id: payload.claimId, status: opts.claim?.status ?? "UNCLAIMED" }];
  return mockTables(opts.user, [[cashbackClaims, claimRows]]);
}

describe("worker-expiry cashback-claim queue (U006)", () => {
  it("registers the cashback-claim-deadline queue name", () => {
    expect(CASHBACK_CLAIM_QUEUE).toBe("cashback-claim-deadline");
    expect(CASHBACK_CLAIM_DEADLINE_EVENT).toBe("CASHBACK_CLAIM_DEADLINE");
  });

  it("processCashbackClaimDeadline writes a CASHBACK_CLAIM_DEADLINE push_events row", async () => {
    const db = mockDb();
    const result = await processCashbackClaimDeadline(payload, db, { now: NOON });

    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]!.eventType).toBe(CASHBACK_CLAIM_DEADLINE_EVENT);
    expect(db.inserted[0]!.userId).toBe(payload.userId);
    expect(db.inserted[0]!.dedupeKey).toBe(
      `cashback-claim-deadline:${payload.claimId}`,
    );
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.title).toMatch(/Cashback claim/i);
    expect(String(db.inserted[0]!.body)).toMatch(/Myntra/);
  });

  it("skips when claim is gone or already claimed", async () => {
    const gone = mockDb({ claim: null });
    expect(await processCashbackClaimDeadline(payload, gone, { now: NOON })).toEqual({
      status: "skipped",
      reason: "claim_gone",
    });
    expect(gone.inserted).toHaveLength(0);

    const claimed = mockDb({ claim: { status: "CLAIMED" } });
    expect(
      await processCashbackClaimDeadline(payload, claimed, { now: NOON }),
    ).toEqual({
      status: "skipped",
      reason: "not_unclaimed",
    });
  });

  it("runs in-memory cashback-claim jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryCashbackClaimWorker(handler, {
      autoProcess: false,
    });
    expect(worker.queue).toBe(CASHBACK_CLAIM_QUEUE);

    await worker.start();
    await worker.enqueue(payload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(payload);
    await worker.stop();
  });

  it("requires REDIS_URL for BullMQ cashback-claim worker", () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    expect(() => createBullmqCashbackClaimWorker()).toThrow(/REDIS_URL/);
    if (prev !== undefined) process.env.REDIS_URL = prev;
  });

  it("enqueue → send mock marks SENT for cashback claim deadline", async () => {
    const sendExpo = vi.fn(async () => ({
      ok: true as const,
      ticketId: "ticket-cb1",
    }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[cashback]" } });
    const result = await processCashbackClaimDeadline(payload, db, {
      now: NOON,
      sendExpo,
    });
    expect(result.status).toBe("sent");
    expect(db.updated[0]).toMatchObject({
      status: "SENT",
      expoTicketId: "ticket-cb1",
    });
  });
});
