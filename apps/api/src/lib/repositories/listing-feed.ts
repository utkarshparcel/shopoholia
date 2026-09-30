import type { ListingRecord } from "./types.js";

/**
 * Feed ordering shared by the memory and Postgres repositories, so both match, rank
 * and paginate listings the same way.
 *
 * Cursors are "sortOrder:id" in catalog order, and "m:sortOrder:id" when the feed is
 * ranked by style, with m = 1 while paging through matching listings and 0 after them.
 * A catalog-order cursor (including any issued before ranking existed) keeps its scroll
 * in catalog order even once the viewer has a style; a ranked cursor sent without one
 * (say, after the token expired) carries on in catalog order from its position.
 */
export type ListingCursor = {
  /** null for a catalog-order cursor. */
  matched: boolean | null;
  sortOrder: number;
  id: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT32_MAX = 2 ** 31 - 1;

export function encodeListingCursor(
  listing: Pick<ListingRecord, "sortOrder" | "id">,
  matched: boolean | null,
): string {
  const position = `${listing.sortOrder}:${listing.id}`;
  return matched === null ? position : `${matched ? 1 : 0}:${position}`;
}

/** Returns null for anything malformed; callers then start from the first page. */
export function decodeListingCursor(cursor: string): ListingCursor | null {
  const parts = cursor.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;

  const flag = parts.length === 3 ? parts[0] : null;
  const [sortOrderPart, id] = parts.slice(-2) as [string, string];
  if (flag !== null && flag !== "0" && flag !== "1") return null;
  if (!/^-?\d+$/.test(sortOrderPart) || !UUID_PATTERN.test(id)) return null;

  // sort_order is a Postgres integer; anything wider could never match a row.
  const sortOrder = Number(sortOrderPart);
  if (Math.abs(sortOrder) > INT32_MAX) return null;

  return { matched: flag === null ? null : flag === "1", sortOrder, id: id.toLowerCase() };
}

/** Code-unit order, which is how Postgres orders uuids and text under the "C" collation. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Any run of characters other than ASCII letters and digits separates words. Postgres
 * applies the same pattern before lowercasing, so matching never depends on locale.
 */
export const LISTING_WORD_SEPARATOR = "[^A-Za-z0-9]+";
const WORD_SEPARATOR_REGEX = new RegExp(LISTING_WORD_SEPARATOR, "g");

/** Lowercase words joined by single spaces, padded so a keyword matches as " keyword ". */
function wordText(text: string): string {
  return ` ${text.replace(WORD_SEPARATOR_REGEX, " ").toLowerCase()} `;
}

/** "Off-White", "off white " and "OFF WHITE" all become "off white"; empties are dropped. */
export function normalizeStyleKeywords(keywords: readonly string[]): string[] {
  const normalized = keywords.map((keyword) => wordText(keyword).trim()).filter(Boolean);
  return [...new Set(normalized)];
}

/**
 * True when one of the (normalized) keywords appears as whole words in the listing's
 * title, category or tags: "t shirt" matches "Graphic T-Shirt" but "tee" doesn't match "teen".
 */
export function matchesStyleKeywords(
  listing: Pick<ListingRecord, "title" | "category" | "tags">,
  keywords: readonly string[],
): boolean {
  const text = wordText(`${listing.title} ${listing.category} ${listing.tags.join(" ")}`);
  return keywords.some((keyword) => text.includes(` ${keyword} `));
}
