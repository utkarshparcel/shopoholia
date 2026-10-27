/**
 * N29-SHOE-BAG-ROT — suggest shoe & bag rotation from wear_log
 * so daily looks don't overwear the same pair.
 */

import { categorySlot } from "./outfit-goes-with.js";

export type ShoeBagItem = {
  id: string;
  category: string;
  brand?: string | null;
  colors?: string[] | null;
};

export type ShoeBagWearLog = {
  wardrobeItemId?: string | null;
  outfitId?: string | null;
  wornOn: Date | string;
};

export type ShoeBagOutfit = {
  id: string;
  itemIds: string[];
};

export type RotationKind = "shoes" | "bag";

export type ShoeBagRotationSuggestion = ShoeBagItem & {
  kind: RotationKind;
  wearCount: number;
  lastWornAt: string | null;
  /** Higher = better pick for rotation (underworn / never worn). */
  score: number;
  reason: string;
};

const BAG_RE = /\b(bags?|handbags?|totes?|clutches?|purses?|crossbody|backpacks?|satchels?)\b/i;

/** True when category is footwear (shoes slot). */
export function isShoeCategory(category: string): boolean {
  return categorySlot(category) === "shoes";
}

/** True when category is a bag (subset of accessories). */
export function isBagCategory(category: string): boolean {
  return BAG_RE.test(category.trim());
}

/** Category filter for shoe & bag rotation pool. */
export function isShoeOrBagCategory(category: string): boolean {
  return isShoeCategory(category) || isBagCategory(category);
}

export function rotationKind(category: string): RotationKind | null {
  if (isShoeCategory(category)) return "shoes";
  if (isBagCategory(category)) return "bag";
  return null;
}

function toTime(wornOn: Date | string): number {
  const d = wornOn instanceof Date ? wornOn : new Date(wornOn);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Rank owned shoes/bags for rotation: never/least-worn first.
 * Optionally expand outfit-linked wear logs via `outfits`.
 */
export function suggestShoeBagRotation(
  items: ShoeBagItem[],
  wearLogs: ShoeBagWearLog[],
  opts?: {
    now?: Date;
    outfits?: ShoeBagOutfit[];
    limit?: number;
    /** Restrict to one kind; default both. */
    kind?: RotationKind | "all";
  },
): ShoeBagRotationSuggestion[] {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 10;
  const kindFilter = opts?.kind ?? "all";
  const outfitMap = new Map((opts?.outfits ?? []).map((o) => [o.id, o.itemIds]));

  const wearCount = new Map<string, number>();
  const lastWorn = new Map<string, number>();

  for (const log of wearLogs) {
    const t = toTime(log.wornOn);
    const ids: string[] = [];
    if (log.wardrobeItemId) ids.push(log.wardrobeItemId);
    if (log.outfitId) {
      const oids = outfitMap.get(log.outfitId);
      if (oids) ids.push(...oids);
    }
    for (const id of ids) {
      wearCount.set(id, (wearCount.get(id) ?? 0) + 1);
      const prev = lastWorn.get(id) ?? 0;
      if (t > prev) lastWorn.set(id, t);
    }
  }

  const pool = items.filter((it) => {
    const kind = rotationKind(it.category);
    if (!kind) return false;
    if (kindFilter !== "all" && kind !== kindFilter) return false;
    return true;
  });

  const scored: ShoeBagRotationSuggestion[] = pool.map((it) => {
    const kind = rotationKind(it.category)!;
    const count = wearCount.get(it.id) ?? 0;
    const last = lastWorn.get(it.id) ?? null;
    const daysSince =
      last == null ? 999 : Math.max(0, (now.getTime() - last) / 86_400_000);
    // Prefer never-worn, then longest rest, then lower wear count
    let score = 0;
    if (count === 0) score += 100;
    score += Math.min(60, daysSince);
    score -= Math.min(40, count * 5);
    const reason =
      count === 0
        ? `Never worn ${kind} — good rotation pick`
        : `Rested ${daysSince < 1 ? "<1" : Math.floor(daysSince)}d · worn ${count}×`;
    return {
      ...it,
      kind,
      wearCount: count,
      lastWornAt: last != null ? new Date(last).toISOString() : null,
      score,
      reason,
    };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.wearCount - b.wearCount ||
      a.category.localeCompare(b.category),
  );
  return scored.slice(0, limit);
}
