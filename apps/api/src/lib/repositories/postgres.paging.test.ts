import { randomInt } from "node:crypto";
import { createDb, wardrobeItems } from "@worn/db";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  keysetAfter,
  keysetCreatedAtText,
  keysetOrderBy,
  toPage,
} from "../paging.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("Postgres keyset paging", () => {
  const db = databaseUrl ? createDb(databaseUrl) : null!;
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

  async function seed() {
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    // 120 rows over three instants: two share a millisecond and differ only in microseconds,
    // and 40 rows tie on each instant.
    const instants = [
      "2026-10-26T10:00:00.123457Z",
      "2026-10-26T10:00:00.123456Z",
      "2026-10-26T10:00:00.123000Z",
    ];
    await db.insert(wardrobeItems).values(
      Array.from({ length: 120 }, (_, i) => ({
        userId: user.id,
        category: "top",
        createdAt: sql`${instants[i % 3]}::timestamptz` as unknown as Date,
      })),
    );
    return user.id;
  }

  async function page(userId: string, limit: number, cursor: string | null) {
    const rows = await db
      .select({ id: wardrobeItems.id, createdAtText: keysetCreatedAtText(wardrobeItems.createdAt) })
      .from(wardrobeItems)
      .where(
        and(
          eq(wardrobeItems.userId, userId),
          keysetAfter(wardrobeItems.createdAt, wardrobeItems.id, decodeCursor(cursor)),
        ),
      )
      .orderBy(...keysetOrderBy(wardrobeItems.createdAt, wardrobeItems.id))
      .limit(limit + 1);
    return toPage(rows, limit, (r) => ({ createdAt: r.createdAtText, id: r.id }), (r) => r.id);
  }

  it("pages 120 tied rows 7 at a time with no skips or repeats", async () => {
    const userId = await seed();
    const all = await db
      .select({ id: wardrobeItems.id })
      .from(wardrobeItems)
      .where(eq(wardrobeItems.userId, userId))
      .orderBy(...keysetOrderBy(wardrobeItems.createdAt, wardrobeItems.id));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const p: Awaited<ReturnType<typeof page>> = await page(userId, 7, cursor);
      expect(p.items.length).toBe(pages < 17 ? 7 : 1);
      seen.push(...p.items);
      cursor = p.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(18);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect(seen).toEqual(all.map((r) => r.id));
  });

  it("keeps the microseconds in the cursor", async () => {
    const userId = await seed();
    const first = await page(userId, 40, null);
    // The first 40 rows are the .123457 instant; the cursor must not round it to .123.
    expect(decodeCursor(first.nextCursor)?.createdAt).toBe("2026-10-26T10:00:00.123457Z");
    const second = await page(userId, 40, first.nextCursor);
    expect(second.items.some((id) => first.items.includes(id))).toBe(false);
  });

  it("would lose rows with a millisecond cursor (why the cursor isn't built from a Date)", async () => {
    const userId = await seed();
    const first = await page(userId, 40, null);
    const last = decodeCursor(first.nextCursor)!;
    const fromDate = encodeCursor({
      createdAt: new Date(last.createdAt.slice(0, 23) + "Z").toISOString().replace("Z", "000Z"),
      id: last.id,
    });
    const wrong = await page(userId, 200, fromDate);
    const right = await page(userId, 200, first.nextCursor);
    expect(right.items).toHaveLength(80);
    expect(wrong.items.length).not.toBe(80);
  });
});
