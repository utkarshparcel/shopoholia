/**
 * Workwear / uniform rotation for weekday (Mon–Fri) auto-plan.
 */

import { categorySlot, type GarmentSlot } from "./outfit-goes-with.js";
import { isActiveClosetItem, type SeasonalItemLike } from "./seasonal-swap.js";
import type { WeekDayKey } from "./outfit-week.js";

export const WORKWEAR_TAG = "workwear";

export type WorkwearItemLike = SeasonalItemLike & {
  category: string;
  colors?: string[] | null;
};

export type WorkwearDayPlan = {
  date: string;
  weekday: WeekDayKey["weekday"];
  itemIds: string[];
  occasion: "WORK";
};

const WEEKDAY_SET = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

export function isWorkday(weekday: WeekDayKey["weekday"]): boolean {
  return WEEKDAY_SET.has(weekday);
}

export function isWorkwearItem(it: WorkwearItemLike): boolean {
  const tags = (it.tags ?? []).map((t) => t.trim().toLowerCase());
  if (tags.includes(WORKWEAR_TAG) || tags.includes("work") || tags.includes("office")) {
    return true;
  }
  // Category heuristic fallback
  return /\b(blazer|formal|oxford|dress.?shirt|trousers|chinos|loafer)\b/i.test(it.category);
}

/**
 * Build Mon–Fri outfits from workwear-tagged items with rotation uniqueness:
 * no shared item ids across planned workdays when the pool allows.
 */
export function planWorkwearRotation(
  wardrobe: WorkwearItemLike[],
  weekDays: WeekDayKey[],
  opts?: { piecesPerDay?: number },
): WorkwearDayPlan[] {
  const piecesPerDay = Math.max(2, opts?.piecesPerDay ?? 3);
  const pool = wardrobe.filter((it) => isWorkwearItem(it) && isActiveClosetItem(it));
  const workdays = weekDays.filter((d) => isWorkday(d.weekday));
  if (workdays.length === 0 || pool.length === 0) return [];

  const bySlot = groupBySlot(pool);
  const used = new Set<string>();
  const plans: WorkwearDayPlan[] = [];

  for (const day of workdays) {
    const picked = pickUniqueOutfit(bySlot, used, piecesPerDay);
    // If uniqueness exhausted the pool, allow reuse for remaining days
    const itemIds =
      picked.length > 0
        ? picked
        : pickUniqueOutfit(bySlot, new Set(), piecesPerDay);
    for (const id of itemIds) used.add(id);
    if (itemIds.length === 0) continue;
    plans.push({
      date: day.date,
      weekday: day.weekday,
      itemIds,
      occasion: "WORK",
    });
  }
  return plans;
}

/** True when no item id appears in more than one day's plan. */
export function rotationIsUnique(plans: WorkwearDayPlan[]): boolean {
  const seen = new Set<string>();
  for (const p of plans) {
    for (const id of p.itemIds) {
      if (seen.has(id)) return false;
      seen.add(id);
    }
  }
  return true;
}

function groupBySlot(items: WorkwearItemLike[]): Map<GarmentSlot, WorkwearItemLike[]> {
  const map = new Map<GarmentSlot, WorkwearItemLike[]>();
  for (const it of items) {
    const slot = categorySlot(it.category);
    const list = map.get(slot) ?? [];
    list.push(it);
    map.set(slot, list);
  }
  return map;
}

function pickUniqueOutfit(
  bySlot: Map<GarmentSlot, WorkwearItemLike[]>,
  used: Set<string>,
  piecesPerDay: number,
): string[] {
  const preferred: GarmentSlot[] = ["top", "bottom", "shoes", "outer", "dress", "accessory", "other"];
  const ids: string[] = [];

  for (const slot of preferred) {
    if (ids.length >= piecesPerDay) break;
    const candidates = bySlot.get(slot) ?? [];
    const next = candidates.find((c) => !used.has(c.id) && !ids.includes(c.id));
    if (next) ids.push(next.id);
  }

  // Fill remaining from any unused workwear
  if (ids.length < piecesPerDay) {
    for (const list of bySlot.values()) {
      for (const it of list) {
        if (ids.length >= piecesPerDay) break;
        if (used.has(it.id) || ids.includes(it.id)) continue;
        ids.push(it.id);
      }
    }
  }
  return ids;
}
