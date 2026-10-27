import type { PageResponse } from "@worn/shared";
import { desc, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Keyset paging over (created_at desc, id desc).
 *
 * The cursor holds the last row's created_at as Postgres keeps it (microseconds, UTC) plus its id.
 * Never build one from a JS Date: a Date holds milliseconds only, so rows that share the
 * millisecond would be skipped or repeated. In Postgres, select `keysetCreatedAtText(col)` next to
 * the row and build the position from that text.
 *
 * Postgres:
 *   const after = decodeCursor(query.cursor);            // throws InvalidCursorError
 *   const rows = await db.select({ row: table, createdAtText: keysetCreatedAtText(table.createdAt) })
 *     .from(table)
 *     .where(and(eq(table.userId, userId), keysetAfter(table.createdAt, table.id, after)))
 *     .orderBy(...keysetOrderBy(table.createdAt, table.id))
 *     .limit(query.limit + 1);                           // one extra row says whether there's more
 *   return toPage(rows, query.limit, (r) => ({ createdAt: r.createdAtText, id: r.row.id }));
 *
 * Memory: `pageInMemory(items, query.limit, decodeCursor(query.cursor), (i) => i.createdAt, (i) => i.id)`.
 *
 * Routes: catch InvalidCursorError and `reply.code(400).send(err.body)` so the body is
 * `{ error: "invalid_cursor", message }`. Uncaught, Fastify still answers 400 with code invalid_cursor.
 */

/** A row's place in the order: created_at as `YYYY-MM-DDTHH:MM:SS.ffffffZ` (UTC) and its uuid. */
export type KeysetPosition = { createdAt: string; id: string };

const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class InvalidCursorError extends Error {
  readonly statusCode = 400;
  readonly code = "invalid_cursor";
  readonly body = { error: "invalid_cursor", message: "cursor is not one this API returned" };

  constructor() {
    super("cursor is not one this API returned");
    this.name = "InvalidCursorError";
  }
}

export function encodeCursor(position: KeysetPosition): string {
  return Buffer.from(`${position.createdAt}|${position.id}`, "utf8").toString("base64url");
}

/** The position after which the next page starts; null (first page) for a missing or empty cursor. */
export function decodeCursor(cursor: string | null | undefined): KeysetPosition | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  if (cursor.length > 512 || !BASE64URL.test(cursor)) throw new InvalidCursorError();
  const parts = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const [createdAt, id] = parts;
  if (parts.length !== 2 || !createdAt || !id || !CREATED_AT.test(createdAt) || !UUID.test(id)) {
    throw new InvalidCursorError();
  }
  // Reject impossible dates (2026-02-30) here rather than as a Postgres 500.
  const ms = `${createdAt.slice(0, 23)}Z`;
  const parsed = new Date(ms);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== ms) throw new InvalidCursorError();
  return { createdAt, id: id.toLowerCase() };
}

/** `created_at` as UTC text with all six fractional digits, to select next to each row. */
export function keysetCreatedAtText(createdAt: AnyPgColumn): SQL<string> {
  return sql<string>`to_char(${createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

/** Rows strictly after `position` in (created_at desc, id desc) order; undefined on the first page. */
export function keysetAfter(
  createdAt: AnyPgColumn,
  id: AnyPgColumn,
  position: KeysetPosition | null,
): SQL | undefined {
  if (!position) return undefined;
  return sql`(${createdAt}, ${id}) < (${position.createdAt}::timestamptz, ${position.id}::uuid)`;
}

export function keysetOrderBy(createdAt: AnyPgColumn, id: AnyPgColumn): SQL[] {
  return [desc(createdAt), desc(id)];
}

/** `rows` fetched with `limit + 1`: the first `limit` items, and a cursor when there was one more. */
export function toPage<R, T = R>(
  rows: R[],
  limit: number,
  positionOf: (row: R) => KeysetPosition,
  map: (row: R) => T = (row) => row as unknown as T,
): PageResponse<T> {
  const kept = rows.slice(0, limit);
  const last = kept[kept.length - 1];
  return {
    items: kept.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(positionOf(last)) : null,
  };
}

/** The same paging over in-memory rows (memory repositories hold millisecond Dates only). */
export function pageInMemory<T>(
  items: readonly T[],
  limit: number,
  after: KeysetPosition | null,
  createdAtOf: (item: T) => Date,
  idOf: (item: T) => string,
): PageResponse<T> {
  const key = (item: T): KeysetPosition => ({
    createdAt: createdAtOf(item).toISOString().replace("Z", "000Z"),
    id: idOf(item).toLowerCase(),
  });
  // Both fields compare correctly as strings: fixed-width UTC text and lowercase uuids.
  const before = (a: KeysetPosition, b: KeysetPosition) =>
    a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
  const sorted = items
    .map((item) => ({ item, pos: key(item) }))
    .sort((a, b) => (before(a.pos, b.pos) ? 1 : before(b.pos, a.pos) ? -1 : 0));
  const rest = after ? sorted.filter((r) => before(r.pos, after)) : sorted;
  return toPage(rest.slice(0, limit + 1), limit, (r) => r.pos, (r) => r.item);
}
