/**
 * Seasonal closet swap — mark pieces ACTIVE vs STORED by season tag
 * so the today generator prefers the in-season rotation.
 */

export type ClosetStatus = "ACTIVE" | "STORED";

export type Season = "summer" | "winter" | "monsoon";

export const SEASONS: Season[] = ["summer", "winter", "monsoon"];

export const SEASON_TAG_PREFIX = "season:";

export type SeasonalItemLike = {
  id: string;
  closetStatus?: ClosetStatus | null;
  tags?: string[] | null;
};

export function seasonTag(season: Season): string {
  return `${SEASON_TAG_PREFIX}${season}`;
}

export function parseSeasonTag(tag: string): Season | null {
  const t = tag.trim().toLowerCase();
  if (!t.startsWith(SEASON_TAG_PREFIX)) return null;
  const rest = t.slice(SEASON_TAG_PREFIX.length);
  if (rest === "summer" || rest === "winter" || rest === "monsoon") return rest;
  return null;
}

/** Seasons declared on an item (empty = year-round). */
export function itemSeasons(it: SeasonalItemLike): Season[] {
  const out: Season[] = [];
  for (const tag of it.tags ?? []) {
    const s = parseSeasonTag(tag);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function itemMatchesSeason(it: SeasonalItemLike, season: Season): boolean {
  const seasons = itemSeasons(it);
  if (seasons.length === 0) return true; // year-round always matches
  return seasons.includes(season);
}

export function isActiveClosetItem(it: SeasonalItemLike): boolean {
  const status = (it.closetStatus ?? "ACTIVE").toUpperCase();
  return status === "ACTIVE";
}

/**
 * Prefer ACTIVE closet pieces; fall back to full pool when none remain
 * (better than generating an empty outfit).
 */
export function preferActiveCloset<T extends SeasonalItemLike>(
  pool: T[],
): { pool: T[]; storedCount: number; applied: boolean } {
  if (pool.length === 0) return { pool, storedCount: 0, applied: false };
  const active = pool.filter(isActiveClosetItem);
  if (active.length === 0) {
    return { pool, storedCount: 0, applied: false };
  }
  const storedCount = pool.length - active.length;
  return {
    pool: active,
    storedCount,
    applied: storedCount > 0,
  };
}

export type SeasonalSwapPatch = {
  id: string;
  closetStatus: ClosetStatus;
};

/**
 * Bulk plan: activate items for `season`, store pieces tagged for other seasons.
 * Year-round (no season tag) stay ACTIVE.
 */
export function planSeasonalSwap(
  items: SeasonalItemLike[],
  season: Season,
): SeasonalSwapPatch[] {
  return items.map((it) => {
    const seasons = itemSeasons(it);
    if (seasons.length === 0) {
      return { id: it.id, closetStatus: "ACTIVE" as const };
    }
    if (seasons.includes(season)) {
      return { id: it.id, closetStatus: "ACTIVE" as const };
    }
    return { id: it.id, closetStatus: "STORED" as const };
  });
}

/** Ensure season tag is present; keep other tags. */
export function withSeasonTag(tags: string[] | null | undefined, season: Season): string[] {
  const next = [...(tags ?? [])].filter((t) => parseSeasonTag(t) == null);
  next.push(seasonTag(season));
  return next;
}
