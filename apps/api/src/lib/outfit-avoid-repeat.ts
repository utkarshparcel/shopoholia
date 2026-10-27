/**
 * Avoid-repeat: exclude wardrobe pieces worn within the last N days
 * so daily outfits don't recycle the same items.
 */

export const DEFAULT_AVOID_REPEAT_DAYS = 7;

export type WearLogLike = {
  wardrobeItemId?: string | null;
  wornOn: Date | string;
  /** When wear is logged against an outfit, expand via outfit itemIds. */
  outfitId?: string | null;
};

export type OutfitLike = {
  id: string;
  itemIds: string[];
};

/**
 * Collect wardrobe item IDs worn within the last `days` days.
 * Outfit-linked wear logs expand to all items in that outfit when `outfits` is provided.
 */
export function recentlyWornItemIds(
  wearLogs: WearLogLike[],
  opts?: {
    days?: number;
    now?: Date;
    outfits?: OutfitLike[];
  },
): Set<string> {
  const days = opts?.days ?? DEFAULT_AVOID_REPEAT_DAYS;
  const now = opts?.now ?? new Date();
  const cutoff = now.getTime() - days * 86_400_000;
  const outfitMap = new Map((opts?.outfits ?? []).map((o) => [o.id, o.itemIds]));
  const worn = new Set<string>();

  for (const log of wearLogs) {
    const wornOn = log.wornOn instanceof Date ? log.wornOn : new Date(log.wornOn);
    if (Number.isNaN(wornOn.getTime()) || wornOn.getTime() < cutoff) continue;
    if (log.wardrobeItemId) worn.add(log.wardrobeItemId);
    if (log.outfitId) {
      const ids = outfitMap.get(log.outfitId);
      if (ids) for (const id of ids) worn.add(id);
    }
  }
  return worn;
}

/**
 * Filter a candidate pool, dropping recently worn pieces when alternatives remain.
 * Falls back to the full pool when exclusion would empty it (better than no outfit).
 */
export function applyAvoidRepeat<T extends { id: string }>(
  pool: T[],
  recentlyWorn: Set<string>,
): { pool: T[]; excludedCount: number; applied: boolean } {
  if (recentlyWorn.size === 0 || pool.length === 0) {
    return { pool, excludedCount: 0, applied: false };
  }
  const filtered = pool.filter((it) => !recentlyWorn.has(it.id));
  if (filtered.length === 0) {
    return { pool, excludedCount: 0, applied: false };
  }
  return {
    pool: filtered,
    excludedCount: pool.length - filtered.length,
    applied: filtered.length < pool.length,
  };
}
