/**
 * N39 — Wedding / festival multi-day wardrobe planner + spend envelope.
 */

import { WEDDING_FESTIVAL_MAX_DAYS } from "@worn/shared";
import { evaluateSpendEnvelope, type SpendEnvelopeEvaluation } from "./budget.js";
import { categorySlot, type GarmentSlot } from "./outfit-goes-with.js";
import { parseDateKey, toDateKey, type WeekDayKey } from "./outfit-week.js";
import { isActiveClosetItem, type SeasonalItemLike } from "./seasonal-swap.js";
import type { OutfitOccasion } from "./cal-event-outfit.js";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type OccasionEventKind = "wedding" | "festival";

export type WeddingFestivalItemLike = SeasonalItemLike & {
  category: string;
  colors?: string[] | null;
};

export type WeddingFestivalDayPlan = {
  date: string;
  weekday: WeekDayKey["weekday"];
  dayIndex: number;
  dayLabel: string;
  occasion: OutfitOccasion;
  itemIds: string[];
};

export type WeddingFestivalEnvelope = SpendEnvelopeEvaluation & {
  limitMinor: number;
  plannedSpendMinor: number;
};

export type WeddingFestivalPlan = {
  kind: OccasionEventKind;
  label: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  days: WeddingFestivalDayPlan[];
  envelope: WeddingFestivalEnvelope | null;
};

/**
 * Inclusive YYYY-MM-DD keys from start→end (UTC). Empty when end < start. At most
 * `WEDDING_FESTIVAL_MAX_DAYS` keys, whatever the span (the body schema rejects longer ones).
 */
export function eventDayKeys(startDate: string, endDate: string): string[] {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const keys: string[] = [];
  for (let t = start.getTime(); t <= end.getTime() && keys.length < WEDDING_FESTIVAL_MAX_DAYS; t += DAY_MS) {
    keys.push(toDateKey(new Date(t)));
  }
  return keys;
}

/** Inclusive day count for an event span. */
export function eventDayCount(startDate: string, endDate: string): number {
  return eventDayKeys(startDate, endDate).length;
}

function weekdayForDateKey(date: string): WeekDayKey["weekday"] {
  const d = parseDateKey(date);
  return WEEKDAYS[d.getUTCDay()] as WeekDayKey["weekday"];
}

/** Ceremony / party day labels for wedding & festival spans. */
export function dayLabelForEvent(
  kind: OccasionEventKind,
  dayIndex: number,
  dayCount: number,
): string {
  if (kind === "wedding") {
    if (dayCount === 1) return "Wedding day";
    if (dayIndex === 0) return "Mehendi / welcome";
    if (dayIndex === dayCount - 1) return "Reception";
    if (dayIndex === Math.floor(dayCount / 2)) return "Wedding ceremony";
    return `Wedding day ${dayIndex + 1}`;
  }
  if (dayCount === 1) return "Festival day";
  if (dayIndex === 0) return "Festival eve";
  if (dayIndex === dayCount - 1) return "Main festival day";
  return `Festival day ${dayIndex + 1}`;
}

/** Map span day → outfit occasion (FORMAL ceremony / PARTY celebration). */
export function occasionForEventDay(
  kind: OccasionEventKind,
  dayIndex: number,
  dayCount: number,
): OutfitOccasion {
  if (kind === "wedding") {
    if (dayCount === 1) return "FORMAL";
    if (dayIndex === 0) return "PARTY";
    if (dayIndex === dayCount - 1) return "PARTY";
    return "FORMAL";
  }
  // festival: eve/party days PARTY; main day FORMAL/festive
  if (dayCount === 1) return "PARTY";
  if (dayIndex === dayCount - 1) return "FORMAL";
  return "PARTY";
}

export function isOccasionWearItem(it: WeddingFestivalItemLike, kind: OccasionEventKind): boolean {
  const tags = (it.tags ?? []).map((t) => t.trim().toLowerCase());
  if (
    tags.some((t) =>
      ["wedding", "festival", "festive", "formal", "party", "occasion", "ethnic"].includes(t),
    )
  ) {
    return true;
  }
  const cat = it.category;
  if (kind === "wedding") {
    return /\b(saree|lehenga|sherwani|kurta|blazer|suit|gown|heels|mojari|formal)\b/i.test(cat);
  }
  return /\b(saree|kurta|lehenga|festive|ethnic|gown|blazer|heels)\b/i.test(cat);
}

/**
 * Prefer occasion-tagged pieces; fall back to full active wardrobe when pool is thin.
 */
function occasionPool(
  wardrobe: WeddingFestivalItemLike[],
  kind: OccasionEventKind,
): WeddingFestivalItemLike[] {
  const active = wardrobe.filter((it) => isActiveClosetItem(it));
  const tagged = active.filter((it) => isOccasionWearItem(it, kind));
  return tagged.length >= 3 ? tagged : active;
}

function groupBySlot(
  items: WeddingFestivalItemLike[],
): Map<GarmentSlot, WeddingFestivalItemLike[]> {
  const map = new Map<GarmentSlot, WeddingFestivalItemLike[]>();
  for (const it of items) {
    const slot = categorySlot(it.category);
    const list = map.get(slot) ?? [];
    list.push(it);
    map.set(slot, list);
  }
  return map;
}

function pickUniqueOutfit(
  bySlot: Map<GarmentSlot, WeddingFestivalItemLike[]>,
  used: Set<string>,
  piecesPerDay: number,
): string[] {
  const preferred: GarmentSlot[] = ["dress", "top", "bottom", "shoes", "outer", "accessory", "other"];
  const ids: string[] = [];

  for (const slot of preferred) {
    if (ids.length >= piecesPerDay) break;
    const candidates = bySlot.get(slot) ?? [];
    const next = candidates.find((c) => !used.has(c.id) && !ids.includes(c.id));
    if (next) ids.push(next.id);
  }

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

/**
 * Build one outfit plan per event day + optional spend envelope for the occasion.
 */
export function planWeddingFestival(
  wardrobe: WeddingFestivalItemLike[],
  opts: {
    startDate: string;
    endDate: string;
    kind: OccasionEventKind;
    label?: string;
    budgetLimitMinor?: number | null;
    plannedSpendMinor?: number | null;
    piecesPerDay?: number;
  },
): WeddingFestivalPlan {
  const keys = eventDayKeys(opts.startDate, opts.endDate);
  const dayCount = keys.length;
  const piecesPerDay = Math.max(2, opts.piecesPerDay ?? 3);
  const pool = occasionPool(wardrobe, opts.kind);
  const bySlot = groupBySlot(pool);
  const used = new Set<string>();
  const days: WeddingFestivalDayPlan[] = [];

  for (let i = 0; i < keys.length; i++) {
    const date = keys[i]!;
    let itemIds = pickUniqueOutfit(bySlot, used, piecesPerDay);
    if (itemIds.length === 0) {
      itemIds = pickUniqueOutfit(bySlot, new Set(), piecesPerDay);
    }
    for (const id of itemIds) used.add(id);
    if (itemIds.length === 0) continue;
    days.push({
      date,
      weekday: weekdayForDateKey(date),
      dayIndex: i,
      dayLabel: dayLabelForEvent(opts.kind, i, dayCount),
      occasion: occasionForEventDay(opts.kind, i, dayCount),
      itemIds,
    });
  }

  let envelope: WeddingFestivalEnvelope | null = null;
  const limit = opts.budgetLimitMinor;
  if (limit != null && limit > 0) {
    const planned = Math.max(0, opts.plannedSpendMinor ?? 0);
    const evaled = evaluateSpendEnvelope(planned, limit);
    envelope = {
      limitMinor: limit,
      plannedSpendMinor: planned,
      ...evaled,
    };
  }

  return {
    kind: opts.kind,
    label: opts.label?.trim() || (opts.kind === "wedding" ? "Wedding" : "Festival"),
    startDate: opts.startDate,
    endDate: opts.endDate,
    dayCount,
    days,
    envelope,
  };
}
