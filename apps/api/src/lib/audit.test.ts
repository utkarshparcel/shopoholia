import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import {
  audit,
  clearAuditLog,
  flushAudit,
  listAuditRecords,
  registerAuditSink,
  sanitizeAuditPayload,
  type AuditSinkRow,
} from "./audit.js";

const log = pino({ level: "silent" });
const USER = "7d0c8f0e-1b2a-4c3d-9e8f-0a1b2c3d4e5f";

describe("sanitizeAuditPayload", () => {
  it("keeps ids, numbers, flags, dates and short codes", () => {
    const at = new Date("2026-10-01T10:00:00.000Z");
    expect(
      sanitizeAuditPayload({
        userId: USER,
        grantId: "grant_1",
        purchaseIds: ["a", "b"],
        count: 3,
        dryRun: true,
        at,
        since: "2026-09-01",
        scope: "EMAIL",
        fields: ["merchant", "totalMinor"],
        counts: { created: 2, skipped: 1 },
      }),
    ).toEqual({
      userId: USER,
      grantId: "grant_1",
      purchaseIds: ["a", "b"],
      count: 3,
      dryRun: true,
      at: "2026-10-01T10:00:00.000Z",
      since: "2026-09-01",
      scope: "EMAIL",
      fields: ["merchant", "totalMinor"],
      counts: { created: 2, skipped: 1 },
    });
  });

  it("drops emails, phone numbers, names and message bodies", () => {
    const out = sanitizeAuditPayload({
      email: "a@b.com",
      phone: "+919876543210",
      userId: "+919876543210",
      name: "Asha",
      body: "Your OTP is 1234",
      merchant: "Amazon",
      note: "free text",
      source: "hello there, this is a sentence",
      contactId: "a@b.com",
      meta: { from: "a@b.com" },
      nested: { count: 1, label: "x" },
      count: Number.NaN,
    });
    expect(out).toEqual({});
  });

  it("caps arrays and key counts", () => {
    const ids = Array.from({ length: 80 }, (_, i) => `id${i}`);
    expect((sanitizeAuditPayload({ itemIds: ids }).itemIds as string[]).length).toBe(50);
    const wide = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`n${i}`, i]));
    expect(Object.keys(sanitizeAuditPayload(wide))).toHaveLength(50);
  });
});

describe("audit sink", () => {
  afterEach(() => clearAuditLog());

  it("writes only the sanitised payload to the log mirror and the sink", async () => {
    const rows: AuditSinkRow[] = [];
    const key = {};
    const unregister = registerAuditSink(key, async (batch) => void rows.push(...batch), log);
    audit(log, "consent.granted", { userId: USER, scope: "EMAIL", email: "a@b.com" });
    audit(log, "consent.granted", { userId: "not-a-uuid", scope: "SMS" });
    await flushAudit();
    unregister();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userId: USER, event: "consent.granted", meta: { scope: "EMAIL" } });
    expect(JSON.stringify(rows)).not.toContain("a@b.com");
    // The sink's user_id column is a uuid; anything else is stored without one.
    expect(rows[1]!.userId).toBeNull();
    const [mirror] = listAuditRecords({ userId: USER });
    expect(mirror!.payload).toEqual({ userId: USER, scope: "EMAIL" });
  });

  it("logs a failed write instead of throwing into the request", async () => {
    const errors: unknown[] = [];
    const spy = { ...log, error: (...args: unknown[]) => void errors.push(args) } as unknown as typeof log;
    const unregister = registerAuditSink({}, async () => {
      throw new Error("db down");
    }, spy);
    audit(log, "consent.granted", { userId: USER });
    await expect(flushAudit()).resolves.toBeUndefined();
    unregister();
    expect(errors).toHaveLength(1);
  });

  it("stops buffering once the last sink is gone", async () => {
    const rows: AuditSinkRow[] = [];
    const unregister = registerAuditSink({}, async (batch) => void rows.push(...batch), log);
    unregister();
    audit(log, "consent.granted", { userId: USER });
    await flushAudit();
    expect(rows).toHaveLength(0);
  });
});
