import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, merchantPurchaseItems, merchantPurchases, users } from "@worn/db";
import { createDbPersister } from "./persistence.js";
import type { ParsedPurchase } from "./parsers/types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("createDbPersister against Postgres", () => {
  const db = databaseUrl ? createDb(databaseUrl) : null!;
  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  async function newUserId(): Promise<string> {
    const [row] = await db
      .insert(users)
      .values({ phone: `9${randomInt(10 ** 10, 10 ** 11)}` })
      .returning({ id: users.id });
    return row!.id;
  }

  const purchase = (patch: Partial<ParsedPurchase> = {}): ParsedPurchase => ({
    merchant: "Amazon",
    orderRef: `403-${randomInt(10 ** 6, 10 ** 7)}-${randomInt(10 ** 6, 10 ** 7)}`,
    purchasedAt: "2026-10-20T10:00:00.000Z",
    currency: "INR",
    totalMinor: 129_900,
    items: [{ title: "Tee", category: "top", priceMinor: 129_900, qty: 1 }],
    confidence: 0.9,
    parserId: "amazon",
    ...patch,
  });

  it("a second email about the same order is the same purchase, moved on to shipped", async () => {
    const userId = await newUserId();
    const persister = createDbPersister(db);
    const placed = purchase();
    const first = await persister.insertPurchase(placed, { sourceKind: "EMAIL", userId });
    const second = await persister.insertPurchase(
      { ...placed, deliveryStatus: "SHIPPED", trackingCode: "AWB123456" },
      { sourceKind: "EMAIL", userId },
    );
    expect(second).toBe(first);
    const rows = await db.select().from(merchantPurchases).where(eq(merchantPurchases.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deliveryStatus: "SHIPPED", trackingCode: "AWB123456" });
    const items = await db.select().from(merchantPurchaseItems).where(eq(merchantPurchaseItems.purchaseId, first));
    expect(items).toHaveLength(1);
  });

  it("the same order ref from another merchant is another purchase", async () => {
    const userId = await newUserId();
    const persister = createDbPersister(db);
    const orderRef = String(randomInt(10 ** 9, 10 ** 10));
    const swiggy = await persister.insertPurchase(purchase({ merchant: "Swiggy", orderRef }), {
      sourceKind: "EMAIL",
      userId,
    });
    const zomato = await persister.insertPurchase(purchase({ merchant: "Zomato", orderRef }), {
      sourceKind: "EMAIL",
      userId,
    });
    expect(zomato).not.toBe(swiggy);
  });
});
