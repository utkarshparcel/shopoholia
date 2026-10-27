import { describe, expect, it, vi } from "vitest";
import type { Db } from "@worn/db";
import {
  createDbPersister,
  enrichPurchaseDelivery,
  smsToRawMessage,
} from "./persistence.js";
import type { ParsedPurchase } from "./parsers/types.js";

function mockDb(opts: { matchedPurchaseId?: string | null; failItems?: boolean } = {}) {
  const inserts: Array<{ values: unknown }> = [];
  const updates: Array<{ values: unknown }> = [];
  const committed = { inserts, updates };
  const exec = (staged: { inserts: typeof inserts; updates: typeof updates }) => ({
    insert: () => ({
      values: (v: unknown) => {
        if (opts.failItems && Array.isArray(v)) return Promise.reject(new Error("items insert failed"));
        staged.inserts.push({ values: v });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (v: unknown) => ({
        where: () => {
          staged.updates.push({ values: v });
          return Promise.resolve();
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve([{ matchedPurchaseId: opts.matchedPurchaseId ?? null }]),
        }),
      }),
    }),
  });
  let transactions = 0;
  return {
    ...exec(committed),
    // All-or-nothing like Postgres: staged writes land only when the callback resolves.
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      transactions += 1;
      const staged = { inserts: [] as typeof inserts, updates: [] as typeof updates };
      const out = await fn(exec(staged));
      inserts.push(...staged.inserts);
      updates.push(...staged.updates);
      return out;
    },
    get transactions() {
      return transactions;
    },
    inserts,
    updates,
  } as unknown as Db & {
    inserts: Array<{ values: unknown }>;
    updates: Array<{ values: unknown }>;
    transactions: number;
  };
}

const basePurchase: ParsedPurchase = {
  merchant: "AMAZON",
  orderRef: "111-2222333-4444555",
  purchasedAt: "2026-01-15T10:00:00.000Z",
  currency: "INR",
  totalMinor: 129900,
  items: [
    {
      title: "Tee",
      category: "top",
      brand: "BrandX",
      priceMinor: 129900,
      qty: 1,
      imageKey: "img/1",
    },
  ],
  confidence: 0.9,
  parserId: "amazon",
};

describe("smsToRawMessage", () => {
  it("normalizes SMS parsedJson into a RawEmailMessage", () => {
    const msg = smsToRawMessage({
      id: "sms-1",
      parsedJson: {
        from: "+919999999999",
        body: "Order shipped Rs. 100",
        receivedAt: "2026-02-01T08:00:00.000Z",
      },
    });
    expect(msg).toEqual({
      messageId: "sms-1",
      from: "+919999999999",
      to: "",
      subject: "SMS from +919999999999",
      text: "Order shipped Rs. 100",
      receivedAt: "2026-02-01T08:00:00.000Z",
    });
  });

  it("defaults missing from/body and synthesizes receivedAt", () => {
    const before = Date.now();
    const msg = smsToRawMessage({ id: "sms-2", parsedJson: {} });
    const after = Date.now();
    expect(msg.from).toBe("unknown");
    expect(msg.subject).toBe("SMS from unknown");
    expect(msg.text).toBe("");
    const ts = new Date(msg.receivedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("enrichPurchaseDelivery", () => {
  it("fills delivery fields from subject/body when purchase omits them", () => {
    const enriched = enrichPurchaseDelivery(
      basePurchase,
      "Your order has shipped",
      "Tracking number: 1Z999AA10123456784",
    );
    expect(enriched.deliveryStatus).toBe("SHIPPED");
    expect(enriched.trackingCode).toBe("1Z999AA10123456784");
  });

  it("preserves explicit delivery fields on the purchase", () => {
    const withDelivery: ParsedPurchase = {
      ...basePurchase,
      deliveryStatus: "DELIVERED",
      etaAt: "2026-01-20T00:00:00.000Z",
      trackingCode: "KEEP-ME",
    };
    const enriched = enrichPurchaseDelivery(
      withDelivery,
      "Out for delivery",
      "AWB: OTHERTRACK",
    );
    expect(enriched.deliveryStatus).toBe("DELIVERED");
    expect(enriched.etaAt).toBe("2026-01-20T00:00:00.000Z");
    expect(enriched.trackingCode).toBe("KEEP-ME");
  });
});

describe("createDbPersister", () => {
  it("inserts purchase + items and returns a purchase id", async () => {
    const db = mockDb();
    const persister = createDbPersister(db);
    const id = await persister.insertPurchase(basePurchase, {
      sourceKind: "EMAIL",
      rawDocId: "doc-1",
      userId: "user-1",
    });
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(db.transactions).toBe(1);
    expect(db.inserts).toHaveLength(2);
    // The document link commits in the same transaction as the purchase.
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.values).toMatchObject({
      status: "MATCHED",
      matchedPurchaseId: id,
      userId: "user-1",
    });
    const purchaseRow = db.inserts[0]!.values as Record<string, unknown>;
    expect(purchaseRow).toMatchObject({
      id,
      userId: "user-1",
      source: "EMAIL",
      merchant: "AMAZON",
      orderRef: "111-2222333-4444555",
      currency: "INR",
      totalMinor: 129900,
      status: "CONFIRMED",
      rawDocId: "doc-1",
      deliveryStatus: "ORDERED",
    });
    expect(purchaseRow.returnWindowDeadline).toBeInstanceOf(Date);
    expect(purchaseRow.exchangeWindowDeadline).toBeInstanceOf(Date);
    const items = db.inserts[1]!.values as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      purchaseId: id,
      title: "Tee",
      category: "top",
      brand: "BrandX",
      priceMinor: 129900,
      imageKey: "img/1",
      qty: 1,
    });
  });

  it("skips item insert when items empty and uses defaults", async () => {
    const db = mockDb();
    const persister = createDbPersister(db);
    const id = await persister.insertPurchase(
      {
        ...basePurchase,
        items: [],
        orderRef: undefined,
        deliveryStatus: "DELIVERED",
        etaAt: "2026-01-18T00:00:00.000Z",
        trackingCode: "TRK-1",
      },
      { sourceKind: "SMS", userId: "user-2" },
    );
    expect(db.inserts).toHaveLength(1);
    expect(db.updates).toHaveLength(0);
    const row = db.inserts[0]!.values as Record<string, unknown>;
    expect(row).toMatchObject({
      id,
      userId: "user-2",
      source: "SMS",
      orderRef: null,
      rawDocId: null,
      deliveryStatus: "DELIVERED",
      trackingCode: "TRK-1",
    });
    expect(row.deliveredAt).toBeInstanceOf(Date);
    expect((row.etaAt as Date).toISOString()).toBe("2026-01-18T00:00:00.000Z");
  });

  it("refuses a purchase without an owner instead of using a placeholder user", async () => {
    const db = mockDb();
    const persister = createDbPersister(db);
    await expect(
      persister.insertPurchase(basePurchase, { sourceKind: "SMS", rawDocId: "doc-1" }),
    ).rejects.toThrow(/userId is required/);
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("a retry for an already matched document returns the existing purchase", async () => {
    const db = mockDb({ matchedPurchaseId: "existing-purchase" });
    const persister = createDbPersister(db);
    const id = await persister.insertPurchase(basePurchase, {
      sourceKind: "EMAIL",
      rawDocId: "doc-1",
      userId: "user-1",
    });
    expect(id).toBe("existing-purchase");
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("writes nothing when the item insert fails (one transaction)", async () => {
    const db = mockDb({ failItems: true });
    const persister = createDbPersister(db);
    await expect(
      persister.insertPurchase(basePurchase, {
        sourceKind: "EMAIL",
        rawDocId: "doc-1",
        userId: "user-1",
      }),
    ).rejects.toThrow(/items insert failed/);
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("markDocument and updateSourceCursor write updates", async () => {
    const db = mockDb();
    const persister = createDbPersister(db);
    await persister.markDocument("doc-9", "MATCHED", "pid-9");
    await persister.markDocument("doc-10", "ERROR");
    await persister.updateSourceCursor("src-1", "hist-99");
    expect(db.updates).toHaveLength(3);
    expect(db.updates[0]!.values).toMatchObject({
      status: "MATCHED",
      matchedPurchaseId: "pid-9",
    });
    expect(db.updates[1]!.values).toMatchObject({
      status: "ERROR",
      matchedPurchaseId: null,
    });
    expect(db.updates[2]!.values).toMatchObject({ cursor: "hist-99" });
  });
});

describe("createDbPersister deliveryStatus default eta", () => {
  it("derives eta when purchase omits etaAt", async () => {
    const db = mockDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    try {
      const persister = createDbPersister(db);
      await persister.insertPurchase(
        { ...basePurchase, items: [], deliveryStatus: "SHIPPED" },
        { sourceKind: "EMAIL", userId: "u1" },
      );
      const row = db.inserts[0]!.values as Record<string, unknown>;
      expect(row.etaAt).toBeInstanceOf(Date);
      expect(row.deliveredAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
