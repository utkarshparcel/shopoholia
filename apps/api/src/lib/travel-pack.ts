/**
 * Travel packing capsule from owned wardrobe + trip dates (+ optional weather).
 */

import { categorySlot, type GarmentSlot } from "./outfit-goes-with.js";
import { isActiveClosetItem, type SeasonalItemLike } from "./seasonal-swap.js";
import type { WeatherCtx } from "./weather.js";

export type TravelPackItemLike = SeasonalItemLike & {
  category: string;
  colors?: string[] | null;
  brand?: string | null;
};

export type CapsuleConstraints = {
  nights: number;
  maxItems: number;
  perSlot: Partial<Record<GarmentSlot, number>>;
};

export type PackListEntry = {
  id: string;
  category: string;
  brand: string | null;
  slot: GarmentSlot;
  reason: string;
  checked: boolean;
};

export type TravelPackResult = {
  startDate: string;
  endDate: string;
  nights: number;
  constraints: CapsuleConstraints;
  items: PackListEntry[];
  checklist: string;
  weather: WeatherCtx | null;
};

const DAY_MS = 86_400_000;

/** Inclusive trip nights: start→end same day = 1 night stay / day trip count 1. */
export function tripNightCount(startDate: string, endDate: string): number {
  const [ys, ms, ds] = startDate.split("-").map(Number);
  const [ye, me, de] = endDate.split("-").map(Number);
  const start = Date.UTC(ys!, (ms ?? 1) - 1, ds ?? 1);
  const end = Date.UTC(ye!, (me ?? 1) - 1, de ?? 1);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
}

/**
 * Capsule size from trip length.
 * Soft caps: tops ≈ nights, bottoms ≈ ceil(nights/2), shoes 1–2, outer weather-dependent.
 */
export function capsuleConstraintsForTrip(
  nights: number,
  opts?: { maxItems?: number; weather?: WeatherCtx | null },
): CapsuleConstraints {
  const n = Math.max(1, nights);
  const weather = opts?.weather ?? null;
  const needOuter =
    weather != null && (weather.tempC <= 22 || weather.condition === "rain" || weather.condition === "cloudy");
  const perSlot: CapsuleConstraints["perSlot"] = {
    top: Math.min(n, 7),
    bottom: Math.min(Math.ceil(n / 2), 4),
    shoes: n >= 4 ? 2 : 1,
    dress: Math.min(Math.floor(n / 3), 2),
    outer: needOuter ? 1 : n >= 5 ? 1 : 0,
    accessory: Math.min(2, Math.ceil(n / 3)),
    other: 1,
  };
  const softSum = Object.values(perSlot).reduce((a, b) => a + (b ?? 0), 0);
  const maxItems = Math.min(opts?.maxItems ?? softSum, softSum);
  return { nights: n, maxItems, perSlot };
}

function weatherReason(weather: WeatherCtx | null, slot: GarmentSlot, category: string): string {
  if (!weather) return `Capsule ${slot}`;
  if (slot === "outer" && weather.condition === "rain") return "Rain cover";
  if (slot === "outer" && weather.tempC <= 22) return "Cool weather layer";
  if (
    (slot === "top" || slot === "dress") &&
    weather.tempC >= 30 &&
    /short|linen|tank|tee/i.test(category)
  ) {
    return "Hot-weather piece";
  }
  return `Capsule ${slot} · ${weather.tempC}°C ${weather.condition}`;
}

/**
 * Build a packing list from owned (prefer ACTIVE) items, respecting capsule size.
 */
export function buildTravelPack(
  wardrobe: TravelPackItemLike[],
  opts: {
    startDate: string;
    endDate: string;
    weather?: WeatherCtx | null;
    maxItems?: number;
  },
): TravelPackResult {
  const nights = tripNightCount(opts.startDate, opts.endDate);
  const constraints = capsuleConstraintsForTrip(nights, {
    maxItems: opts.maxItems,
    weather: opts.weather ?? null,
  });

  const active = preferActiveOrAll(wardrobe);
  const bySlot = new Map<GarmentSlot, TravelPackItemLike[]>();
  for (const it of active) {
    const slot = categorySlot(it.category);
    const list = bySlot.get(slot) ?? [];
    list.push(it);
    bySlot.set(slot, list);
  }

  const picked: PackListEntry[] = [];
  const used = new Set<string>();

  const slotOrder: GarmentSlot[] = ["top", "bottom", "shoes", "dress", "outer", "accessory", "other"];
  for (const slot of slotOrder) {
    const want = constraints.perSlot[slot] ?? 0;
    if (want <= 0) continue;
    const candidates = bySlot.get(slot) ?? [];
    let taken = 0;
    for (const it of candidates) {
      if (taken >= want || picked.length >= constraints.maxItems) break;
      if (used.has(it.id)) continue;
      used.add(it.id);
      picked.push({
        id: it.id,
        category: it.category,
        brand: it.brand ?? null,
        slot,
        reason: weatherReason(opts.weather ?? null, slot, it.category),
        checked: false,
      });
      taken += 1;
    }
  }

  const checklist = exportPackChecklist(picked, {
    startDate: opts.startDate,
    endDate: opts.endDate,
    nights,
  });

  return {
    startDate: opts.startDate,
    endDate: opts.endDate,
    nights,
    constraints,
    items: picked,
    checklist,
    weather: opts.weather ?? null,
  };
}

function preferActiveOrAll(items: TravelPackItemLike[]): TravelPackItemLike[] {
  const active = items.filter(isActiveClosetItem);
  return active.length > 0 ? active : items;
}

export function exportPackChecklist(
  items: PackListEntry[],
  meta: { startDate: string; endDate: string; nights: number },
): string {
  const lines = [
    `# Travel pack · ${meta.startDate} → ${meta.endDate} (${meta.nights} day${meta.nights === 1 ? "" : "s"})`,
    "",
    ...items.map((it) => {
      // W054 — category + slot only (no emails/ids); brand is garment label, not account PII.
      const label = [it.brand, it.category].filter(Boolean).join(" · ") || it.category;
      return `- [ ] ${label} (${it.slot}) — ${it.reason}`;
    }),
  ];
  if (items.length === 0) lines.push("- [ ] (no wardrobe pieces matched capsule slots)");
  return lines.join("\n");
}
