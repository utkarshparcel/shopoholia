import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertItemsSplitable,
  assertPurchasesMergeable,
  lineMinor,
  sumItemsMinor,
} from "../lib/purchase-merge-split.js";
import type {
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
} from "../lib/repositories/types.js";
import { buildTestServer, login } from "../test-utils.js";

function basePurchase(
  overrides: Partial<MerchantPurchaseRecord> & Pick<MerchantPurchaseRecord, "id" | "userId">,
): MerchantPurchaseRecord {
  const now = new Date();
  return {
    source: "EMAIL",
    merchant: "Amazon",
    orderRef: null,
    purchasedAt: now,
    currency: "INR",
    totalMinor: 1000,
    status: "CONFIRMED",
    rawDocId: null,
    deliveryStatus: "ORDERED",
    etaAt: null,
    trackingCode: null,
    deliveredAt: null,
    returnWindowDeadline: null,
    exchangeWindowDeadline: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseItem(
  overrides: Partial<MerchantPurchaseItemRecord> &
    Pick<MerchantPurchaseItemRecord, "id" | "purchaseId">,
): MerchantPurchaseItemRecord {
  const now = new Date();
  return {
    title: "Item",
    category: null,
    brand: null,
    priceMinor: 500,
    imageKey: null,
    qty: 1,
    duplicateWardrobeItemId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("purchase-merge-split integrity helpers", () => {
  it("sums line totals with qty", () => {
    expect(lineMinor({ priceMinor: 100, qty: 3 })).toBe(300);
    expect(
      sumItemsMinor([
        { priceMinor: 100, qty: 2 },
        { priceMinor: 50, qty: 1 },
      ]),
    ).toBe(250);
  });

  it("rejects merge across users / currencies / duplicates", () => {
    const a = basePurchase({ id: "a", userId: "u1", currency: "INR" });
    const b = basePurchase({ id: "b", userId: "u1", currency: "USD" });
    expect(() => assertPurchasesMergeable(a, b, "u1")).toThrow(/currency/i);
    expect(() => assertPurchasesMergeable(a, b, "u2")).toThrow(/not found/i);
    const dup = basePurchase({ id: "c", userId: "u1", status: "DUPLICATE" });
    expect(() => assertPurchasesMergeable(a, dup, "u1")).toThrow(/DUPLICATE/);
  });

  it("rejects splitting all items or foreign item ids", () => {
    const p = basePurchase({ id: "p1", userId: "u1" });
    const items = [
      baseItem({ id: "i1", purchaseId: "p1", priceMinor: 100 }),
      baseItem({ id: "i2", purchaseId: "p1", priceMinor: 200 }),
    ];
    expect(() => assertItemsSplitable(p, items, ["i1", "i2"], "u1")).toThrow(
      /at least one item/,
    );
    expect(() => assertItemsSplitable(p, items, ["missing"], "u1")).toThrow(
      /belong/,
    );
    const moving = assertItemsSplitable(p, items, ["i2"], "u1");
    expect(moving).toHaveLength(1);
    expect(moving[0]!.id).toBe("i2");
  });
});

describe("POST /purchases/merge + /purchases/split", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  let token: string;
  let userId: string;

  beforeEach(async () => {
    ({ app } = await buildTestServer());
    ({ accessToken: token, userId } = await login(app));
  });

  afterEach(async () => {
    await app.close();
  });

  it("merges two purchases: items move, totals heal, source marked DUPLICATE", async () => {
    const a = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date("2026-01-10T00:00:00Z"),
      currency: "INR",
      totalMinor: 10000,
      items: [{ title: "Tee", priceMinor: 10000, qty: 1 }],
    });
    const b = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date("2026-01-10T00:00:00Z"),
      currency: "INR",
      totalMinor: 5000,
      items: [{ title: "Socks", priceMinor: 2500, qty: 2 }],
    });

    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-merge",
      parsedJson: { merchant: "Myntra", __userId: userId },
    });
    await app.deps.repos.updateIngestionDocumentStatus(doc.id, "MATCHED", b.purchase.id);

    const sourceItemId = b.items[0]!.id;

    const res = await app.inject({
      method: "POST",
      url: "/purchases/merge",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        targetPurchaseId: a.purchase.id,
        sourcePurchaseId: b.purchase.id,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      purchase: { id: string; totalMinor: number; status: string };
      items: Array<{
        id: string;
        title: string;
        purchaseId: string;
        priceMinor: number;
        qty: number;
      }>;
      mergedFromId: string;
    };
    expect(body.purchase.id).toBe(a.purchase.id);
    expect(body.mergedFromId).toBe(b.purchase.id);
    expect(body.items).toHaveLength(2);
    expect(body.items.map((i) => i.id)).toContain(sourceItemId);
    expect(body.purchase.totalMinor).toBe(15000);
    expect(
      sumItemsMinor(
        body.items as Array<{ priceMinor: number; qty: number }>,
      ),
    ).toBe(body.purchase.totalMinor);

    const source = await app.deps.repos.findMerchantPurchaseById(b.purchase.id);
    expect(source!.status).toBe("DUPLICATE");
    expect(source!.totalMinor).toBe(0);
    expect(await app.deps.repos.listMerchantPurchaseItems(b.purchase.id)).toHaveLength(0);

    const updatedDoc = await app.deps.repos.getIngestionDocumentById(doc.id);
    expect(updatedDoc!.matchedPurchaseId).toBe(a.purchase.id);

    const list = await app.inject({
      method: "GET",
      url: "/purchases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json() as { purchases: Array<{ purchase: { id: string } }> };
    expect(listed.purchases.map((p) => p.purchase.id)).toContain(a.purchase.id);
    expect(listed.purchases.map((p) => p.purchase.id)).not.toContain(b.purchase.id);
  });

  it("splits items onto a new purchase preserving item ids and totals", async () => {
    const created = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Flipkart",
      purchasedAt: new Date("2026-02-01T00:00:00Z"),
      currency: "INR",
      totalMinor: 9000,
      items: [
        { title: "Shirt", priceMinor: 4000, qty: 1 },
        { title: "Jeans", priceMinor: 5000, qty: 1 },
      ],
    });
    const jeansId = created.items.find((i) => i.title === "Jeans")!.id;
    const shirtId = created.items.find((i) => i.title === "Shirt")!.id;

    const res = await app.inject({
      method: "POST",
      url: "/purchases/split",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        purchaseId: created.purchase.id,
        itemIds: [jeansId],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      original: {
        purchase: { id: string; totalMinor: number };
        items: Array<{ id: string; purchaseId: string; title: string; priceMinor: number; qty: number }>;
      };
      split: {
        purchase: { id: string; totalMinor: number; merchant: string };
        items: Array<{ id: string; purchaseId: string; title: string; priceMinor: number; qty: number }>;
      };
    };

    expect(body.original.purchase.id).toBe(created.purchase.id);
    expect(body.original.purchase.totalMinor).toBe(4000);
    expect(body.original.items).toHaveLength(1);
    expect(body.original.items[0]!.id).toBe(shirtId);

    expect(body.split.purchase.id).not.toBe(created.purchase.id);
    expect(body.split.purchase.merchant).toBe("Flipkart");
    expect(body.split.purchase.totalMinor).toBe(5000);
    expect(body.split.items).toHaveLength(1);
    expect(body.split.items[0]!.id).toBe(jeansId);
    expect(body.split.items[0]!.purchaseId).toBe(body.split.purchase.id);

    // Integrity: totals === sum(lines)
    expect(sumItemsMinor(body.original.items)).toBe(body.original.purchase.totalMinor);
    expect(sumItemsMinor(body.split.items)).toBe(body.split.purchase.totalMinor);
  });

  it("rejects merge of different currencies and split of all items", async () => {
    const inr = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "A",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 100,
      items: [{ title: "X", priceMinor: 100 }],
    });
    const usd = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "A",
      purchasedAt: new Date(),
      currency: "USD",
      totalMinor: 100,
      items: [{ title: "Y", priceMinor: 100 }],
    });

    const mergeRes = await app.inject({
      method: "POST",
      url: "/purchases/merge",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        targetPurchaseId: inr.purchase.id,
        sourcePurchaseId: usd.purchase.id,
      },
    });
    expect(mergeRes.statusCode).toBe(409);

    const multi = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "B",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 300,
      items: [
        { title: "1", priceMinor: 100 },
        { title: "2", priceMinor: 200 },
      ],
    });
    const splitAll = await app.inject({
      method: "POST",
      url: "/purchases/split",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        purchaseId: multi.purchase.id,
        itemIds: multi.items.map((i) => i.id),
      },
    });
    expect(splitAll.statusCode).toBe(400);
  });
});
