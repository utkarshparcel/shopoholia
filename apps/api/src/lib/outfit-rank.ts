import type { WeatherCtx } from "./weather.js";

export type RankableWardrobeItem = {
  id: string;
  category: string;
  colors?: string[] | null;
  laundryStatus?: string | null;
  isClean?: boolean;
  clean?: boolean;
  laundryState?: string;
  laundry?: string;
  createdAt: Date;
};

export type StyleProfileLike = {
  tags?: string[];
} | null;

export type ScoredOutfitItem = {
  item: RankableWardrobeItem;
  score: number;
};

/** Prefer CLEAN items; DIRTY / IN_LAUNDRY excluded when any clean pieces exist. */
export function isItemClean(it: RankableWardrobeItem): boolean {
  if (typeof it.isClean === "boolean") return it.isClean;
  if (typeof it.clean === "boolean") return it.clean;
  const laundry = (it.laundryStatus ?? it.laundryState ?? it.laundry) as string | undefined;
  if (!laundry) return true;
  const s = laundry.toUpperCase();
  return s === "CLEAN" || s === "READY" || s === "WASHED";
}

export function weatherOccasion(weather: WeatherCtx | null): "CASUAL" | "WORK" | "SPORT" | "TRAVEL" {
  if (!weather) return "CASUAL";
  if (weather.condition === "rain") return "TRAVEL";
  if (weather.tempC >= 32) return "CASUAL";
  if (weather.tempC <= 20) return "WORK";
  return "CASUAL";
}

/**
 * Stable taste + weather + wear-frequency ranking.
 * Sort key: score desc, then createdAt asc (deterministic ties).
 */
export function rankWardrobeItems(input: {
  items: RankableWardrobeItem[];
  styleProfile?: StyleProfileLike;
  wearCount?: Map<string, number>;
  /** Null when no weather provider answered: weather then plays no part. */
  weather: WeatherCtx | null;
  /** Item ids blocked (e.g. worn recently) — scored but can be filtered after. */
  blockedIds?: Set<string>;
}): { scored: ScoredOutfitItem[]; pool: RankableWardrobeItem[]; whyHints: string[] } {
  const whyHints: string[] = [];
  const wearCount = input.wearCount ?? new Map<string, number>();
  const styleProfile = input.styleProfile ?? null;
  const weather = input.weather;
  const blocked = input.blockedIds ?? new Set<string>();

  const clean = input.items.filter((it) => isItemClean(it));
  const pool = clean.length > 0 ? clean : input.items;
  if (clean.length > 0 && clean.length < input.items.length) {
    whyHints.push("Skipped pieces marked dirty or in laundry");
  }

  const scored: ScoredOutfitItem[] = pool.map((it) => {
    let score = 0;
    const tags: string[] = styleProfile?.tags ?? [];
    for (const t of tags) {
      const tl = t.toLowerCase();
      if (it.category.toLowerCase().includes(tl)) score += 3;
      if ((it.colors ?? []).some((c: string) => c.toLowerCase() === tl)) score += 2;
    }
    score += Math.min(wearCount.get(it.id) ?? 0, 5);
    if (
      weather &&
      weather.tempC >= 30 &&
      (it.category.toLowerCase().includes("short") || it.category.toLowerCase().includes("linen"))
    ) {
      score += 2;
    }
    if (
      weather &&
      weather.tempC <= 22 &&
      (it.category.toLowerCase().includes("jacket") || it.category.toLowerCase().includes("layer"))
    ) {
      score += 2;
    }
    if (weather?.condition === "rain" && it.category.toLowerCase().includes("rain")) score += 3;
    if (blocked.has(it.id)) score -= 100; // heavily demote worn-blocked
    return { item: it, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score || a.item.createdAt.getTime() - b.item.createdAt.getTime(),
  );

  return { scored, pool, whyHints };
}

/**
 * Pick the `altIndex`-th disjoint outfit of up to `pickCount` pieces from a ranked list,
 * excluding `excludeIds` (e.g. already-worn-blocked).
 * altIndex 0 = primary; 1 = next alternative, etc.
 */
export function pickOutfitSlice(
  scored: ScoredOutfitItem[],
  opts: {
    altIndex?: number;
    pickCount?: number;
    excludeIds?: Set<string>;
  } = {},
): { selected: RankableWardrobeItem[]; altIndex: number; hasMore: boolean } {
  const altIndex = Math.max(0, opts.altIndex ?? 0);
  const pickCount = opts.pickCount ?? 3;
  const exclude = opts.excludeIds ?? new Set<string>();

  const eligible = scored.filter((s) => !exclude.has(s.item.id) && s.score > -50);
  const start = altIndex * pickCount;
  const slice = eligible.slice(start, start + pickCount).map((s) => s.item);
  const hasMore = eligible.length > start + pickCount;
  return { selected: slice, altIndex, hasMore };
}

export function buildWhyThis(input: {
  whyHints: string[];
  selected: RankableWardrobeItem[];
  styleProfile?: StyleProfileLike;
  wearCount?: Map<string, number>;
  weather: WeatherCtx | null;
  altIndex?: number;
}): string[] {
  const whyThis = [...input.whyHints];
  const wearCount = input.wearCount ?? new Map();
  const styleProfile = input.styleProfile ?? null;
  const weather = input.weather;

  if (styleProfile?.tags?.length) {
    whyThis.push(`Matched your taste tags: ${styleProfile.tags.slice(0, 3).join(", ")}`);
  }
  const favorites = input.selected.filter((it) => (wearCount.get(it.id) ?? 0) > 0);
  if (favorites.length) {
    whyThis.push(`Included ${favorites.length} piece(s) you wear often`);
  }
  if (weather) {
    whyThis.push(`Weather ${weather.tempC}°C, ${weather.condition.replace(/_/g, " ")}`);
  }
  if ((input.altIndex ?? 0) > 0) {
    whyThis.push(`Alternative look #${(input.altIndex ?? 0) + 1}`);
  }
  if (whyThis.length === 0) {
    whyThis.push("Picked clean wardrobe staples for today");
  }
  return whyThis;
}

/** Items worn on the same local calendar day (UTC date fallback) are blocked from alts. */
export function wornBlockedIds(
  wearLogs: Array<{ wardrobeItemId?: string | null; outfitItemIds?: string[]; wornOn: Date }>,
  now: Date = new Date(),
  windowMs: number = 18 * 60 * 60 * 1000,
): Set<string> {
  const blocked = new Set<string>();
  const cutoff = now.getTime() - windowMs;
  for (const log of wearLogs) {
    if (log.wornOn.getTime() < cutoff) continue;
    if (log.wardrobeItemId) blocked.add(log.wardrobeItemId);
    for (const id of log.outfitItemIds ?? []) blocked.add(id);
  }
  return blocked;
}
