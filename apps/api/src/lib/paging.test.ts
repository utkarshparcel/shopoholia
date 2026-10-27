import { describe, expect, it } from "vitest";
import { InvalidCursorError, decodeCursor, encodeCursor, pageInMemory, toPage } from "./paging.js";

const ID_A = "0b6f6a52-6f3f-4c6e-9f43-7c1c2a4c9d01";

describe("cursor encoding", () => {
  it("round-trips a position with microseconds", () => {
    const pos = { createdAt: "2026-10-26T10:00:00.123456Z", id: ID_A };
    const cursor = encodeCursor(pos);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual(pos);
    expect(decodeCursor(encodeCursor({ ...pos, id: ID_A.toUpperCase() }))?.id).toBe(ID_A);
  });

  it("treats a missing or empty cursor as the first page", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("rejects anything it didn't make with InvalidCursorError (400 invalid_cursor)", () => {
    const enc = (s: string) => Buffer.from(s).toString("base64url");
    const bad = [
      "not base64!",
      "x".repeat(513),
      enc("2026-10-26T10:00:00.123456Z"),
      enc(`2026-10-26T10:00:00.123Z|${ID_A}`),
      enc(`2026-02-30T10:00:00.123456Z|${ID_A}`),
      enc(`2026-13-01T10:00:00.123456Z|${ID_A}`),
      enc("2026-10-26T10:00:00.123456Z|not-a-uuid"),
      enc(`2026-10-26T10:00:00.123456Z|${ID_A}|extra`),
      enc("{}"),
    ];
    for (const cursor of bad) {
      expect(() => decodeCursor(cursor), cursor).toThrow(InvalidCursorError);
    }
    const err = new InvalidCursorError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("invalid_cursor");
    expect(err.body).toEqual({ error: "invalid_cursor", message: expect.any(String) });
  });
});

describe("toPage", () => {
  it("keeps `limit` rows and gives a cursor only when one more row was fetched", () => {
    const rows = [1, 2, 3].map((n) => ({ n, pos: { createdAt: "2026-10-26T10:00:00.000000Z", id: ID_A } }));
    expect(toPage(rows, 3, (r) => r.pos).nextCursor).toBeNull();
    const page = toPage(rows, 2, (r) => r.pos, (r) => r.n);
    expect(page.items).toEqual([1, 2]);
    expect(decodeCursor(page.nextCursor)).toEqual(rows[1]!.pos);
  });
});

describe("pageInMemory", () => {
  it("pages rows sharing a millisecond without skips or repeats", () => {
    const t = new Date("2026-10-26T10:00:00.123Z");
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String((i * 7919) % 1000).padStart(12, "0")}`,
      createdAt: i < 20 ? t : new Date(t.getTime() - 1),
    }));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: ReturnType<typeof pageInMemory<(typeof items)[number]>> = pageInMemory(
        items,
        7,
        decodeCursor(cursor),
        (i) => i.createdAt,
        (i) => i.id,
      );
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    const expected = [...items]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((i) => i.id);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(30);
  });
});
