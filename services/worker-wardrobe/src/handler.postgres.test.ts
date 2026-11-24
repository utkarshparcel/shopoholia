import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, outfits, users, wardrobeItems } from "@worn/db";
import { processOutfit } from "./handler.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("processOutfit against Postgres", () => {
  const db = databaseUrl ? createDb(databaseUrl) : null!;
  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  it("never picks a discarded, stored or (when clean ones exist) dirty item", async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: `9${randomInt(10 ** 10, 10 ** 11)}`, timeZone: "Asia/Kolkata" })
      .returning({ id: users.id });
    const userId = user!.id;
    await db.insert(wardrobeItems).values([
      { userId, category: "discarded shirt", discardedAt: new Date() },
      { userId, category: "stored coat", closetStatus: "STORED" },
      { userId, category: "dirty jeans", laundryStatus: "DIRTY" },
      { userId, category: "clean tee" },
      { userId, category: "clean trousers" },
    ]);

    // Noon IST: outside quiet hours.
    const result = await processOutfit({ userId, trigger: "morning" }, db, {
      now: new Date("2026-08-26T06:30:00.000Z"),
    });
    expect(result.outfitId).toBeTruthy();
    const [outfit] = await db.select().from(outfits).where(eq(outfits.id, result.outfitId!));
    const picked = await db.select().from(wardrobeItems).where(eq(wardrobeItems.userId, userId));
    const byId = new Map(picked.map((p) => [p.id, p.category]));
    expect(outfit!.itemIds.map((id) => byId.get(id)).sort()).toEqual(["clean tee", "clean trousers"]);
  });
});
