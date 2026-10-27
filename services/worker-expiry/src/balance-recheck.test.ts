import { describe, expect, it, vi } from "vitest";
import {
  BALANCE_RECHECK_EVENT,
  BALANCE_RECHECK_QUEUE,
  createBullmqBalanceRecheckWorker,
  createMemoryBalanceRecheckWorker,
  processBalanceRecheck,
} from "./index.js";
import type { BalanceRecheckPayload } from "./index.js";
import { moneyAccounts } from "@worn/db";
import { mockDb as mockTables, type MockUser } from "./mock-db.test-helper.js";

const payload: BalanceRecheckPayload = {
  accountId: "00000000-0000-4000-8000-0000000000a1",
  userId: "00000000-0000-4000-8000-0000000000b1",
  merchant: "Myntra",
  lastCheckedAt: "2026-07-01T00:00:00.000Z",
};

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockDb(opts: { account?: { status: string } | null; user?: MockUser } = {}) {
  const accountRows =
    opts.account === null ? [] : [{ id: payload.accountId, status: opts.account?.status ?? "ACTIVE" }];
  return mockTables(opts.user, [[moneyAccounts, accountRows]]);
}

describe("worker-expiry balance-recheck queue (WV02)", () => {
  it("registers the credit-balance-recheck queue name", () => {
    expect(BALANCE_RECHECK_QUEUE).toBe("credit-balance-recheck");
    expect(BALANCE_RECHECK_EVENT).toBe("CREDIT_BALANCE_RECHECK");
  });

  it("processBalanceRecheck writes a CREDIT_BALANCE_RECHECK push_events row", async () => {
    const db = mockDb();
    const result = await processBalanceRecheck(payload, db, { now: NOON });

    expect(result.status).toBe("queued");
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]!.eventType).toBe(BALANCE_RECHECK_EVENT);
    expect(db.inserted[0]!.userId).toBe(payload.userId);
    expect(db.inserted[0]!.dedupeKey).toBe(
      `credit-balance-recheck:${payload.accountId}:2026-07-01`,
    );
    expect(db.inserted[0]!.status).toBe("QUEUED");
    expect(db.inserted[0]!.title).toMatch(/Myntra/);
  });

  it("skips when account is gone or closed", async () => {
    const gone = mockDb({ account: null });
    expect(await processBalanceRecheck(payload, gone, { now: NOON })).toEqual({
      status: "skipped",
      reason: "account_gone",
    });
    expect(gone.inserted).toHaveLength(0);

    const closed = mockDb({ account: { status: "CLOSED" } });
    expect(await processBalanceRecheck(payload, closed, { now: NOON })).toEqual({
      status: "skipped",
      reason: "account_gone",
    });
  });

  it("skips when the user no longer exists", async () => {
    const db = mockDb({ user: null });
    expect((await processBalanceRecheck(payload, db, { now: NOON })).status).toBe("skipped");
    expect(db.inserted).toHaveLength(0);
  });

  it("runs in-memory balance-recheck jobs through the handler", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryBalanceRecheckWorker(handler, {
      autoProcess: false,
    });
    expect(worker.queue).toBe(BALANCE_RECHECK_QUEUE);

    await worker.start();
    await worker.enqueue(payload, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(payload);
    await worker.stop();
  });

  it("requires REDIS_URL for BullMQ balance-recheck worker", () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    expect(() => createBullmqBalanceRecheckWorker()).toThrow(/REDIS_URL/);
    if (prev !== undefined) process.env.REDIS_URL = prev;
  });

  it("enqueue → send mock marks SENT for balance recheck, once when run twice", async () => {
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-b1" }));
    const db = mockDb({ user: { pushToken: "ExponentPushToken[balance]" } });
    const result = await processBalanceRecheck(payload, db, { now: NOON, sendExpo });
    expect(result.status).toBe("sent");
    expect(db.updated[0]).toMatchObject({ status: "SENT", expoTicketId: "ticket-b1" });
    expect((await processBalanceRecheck(payload, db, { now: NOON, sendExpo })).status).toBe("skipped");
    expect(sendExpo).toHaveBeenCalledTimes(1);
  });
});
