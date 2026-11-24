/**
 * U048 — Region pack defaults: merchants, festivals, size systems.
 * Complements W092 fit-template seeding.
 */

import type { FitRegionPackId } from "@worn/shared";
import { indianFestivalDate } from "./festivals.js";

/**
 * How a festival's date moves from year to year. Absent: the same month/day every year.
 * - `lunar-in`: the per-year IN table in festivals.ts (no date outside it, never a guess).
 * - `nth-weekday`: the nth `weekday` (0 = Sunday) of `month`, `n = -1` for the last one, plus
 *   `offsetDays` (Black Friday is the day after Thanksgiving).
 */
export type FestivalRule =
  | { kind: "lunar-in" }
  | { kind: "nth-weekday"; weekday: number; n: number; offsetDays?: number };

export type RegionFestivalSeed = {
  occasion: string;
  label: string;
  /** Month 1–12 and day of the 2026 date; `rule` moves it for other years. */
  month: number;
  day: number;
  rule?: FestivalRule;
};

export type RegionPackDefaults = {
  region: FitRegionPackId;
  merchants: string[];
  festivals: RegionFestivalSeed[];
  /** Size system labels for Fit Vault UI. */
  sizeSystem: {
    id: string;
    label: string;
    examples: string[];
  };
  /** Short copy for onboarding confirmation. */
  summary: string;
};

const PACKS: Record<FitRegionPackId, RegionPackDefaults> = {
  IN: {
    region: "IN",
    merchants: ["Myntra", "Ajio", "Flipkart", "Amazon", "Nykaa", "Meesho"],
    festivals: [
      { occasion: "FESTIVAL", label: "Diwali", month: 11, day: 8, rule: { kind: "lunar-in" } },
      { occasion: "FESTIVAL", label: "Rakhi", month: 8, day: 28, rule: { kind: "lunar-in" } },
      { occasion: "FESTIVAL", label: "Holi", month: 3, day: 3, rule: { kind: "lunar-in" } },
    ],
    sizeSystem: {
      id: "IN_ALPHA",
      label: "India (S–XXL / blouse inches)",
      examples: ["S", "M", "L", "XL", "32", "34", "36"],
    },
    summary: "India merchants, festival dates, and blouse/kurti size labels.",
  },
  US: {
    region: "US",
    merchants: ["Amazon", "Target", "Walmart", "Nordstrom", "Nike"],
    festivals: [
      // Fourth Thursday of November.
      {
        occasion: "FESTIVAL",
        label: "Thanksgiving",
        month: 11,
        day: 26,
        rule: { kind: "nth-weekday", weekday: 4, n: 4 },
      },
      {
        occasion: "FESTIVAL",
        label: "Black Friday",
        month: 11,
        day: 27,
        rule: { kind: "nth-weekday", weekday: 4, n: 4, offsetDays: 1 },
      },
      { occasion: "FESTIVAL", label: "Christmas", month: 12, day: 25 },
    ],
    sizeSystem: {
      id: "US_NUMERIC",
      label: "US numeric / alpha",
      examples: ["0", "2", "4", "6", "8", "S", "M", "L"],
    },
    summary: "US merchants, holiday dates, and US size labels.",
  },
  UK: {
    region: "UK",
    merchants: ["ASOS", "John Lewis", "Marks & Spencer", "Zara", "Nike"],
    festivals: [
      { occasion: "FESTIVAL", label: "Boxing Day", month: 12, day: 26 },
      { occasion: "FESTIVAL", label: "Christmas", month: 12, day: 25 },
      // Summer bank holiday: the last Monday of August.
      {
        occasion: "FESTIVAL",
        label: "Bank Holiday",
        month: 8,
        day: 31,
        rule: { kind: "nth-weekday", weekday: 1, n: -1 },
      },
    ],
    sizeSystem: {
      id: "UK_NUMERIC",
      label: "UK numeric",
      examples: ["6", "8", "10", "12", "14", "16"],
    },
    summary: "UK merchants, holiday dates, and UK size labels.",
  },
  GLOBAL: {
    region: "GLOBAL",
    merchants: ["Amazon", "Zara", "Nike", "H&M"],
    festivals: [
      { occasion: "FESTIVAL", label: "New Year", month: 1, day: 1 },
      { occasion: "FESTIVAL", label: "Christmas", month: 12, day: 25 },
    ],
    sizeSystem: {
      id: "GLOBAL_ALPHA",
      label: "International alpha",
      examples: ["XS", "S", "M", "L", "XL"],
    },
    summary: "Global merchants, common holidays, and alpha sizes.",
  },
};

export function getRegionPackDefaults(region: FitRegionPackId): RegionPackDefaults {
  return PACKS[region];
}

const DAY_MS = 86_400_000;

/** The festival's date in `year` (UTC midnight), or null when it isn't known for that year. */
export function festivalDateInYear(seed: RegionFestivalSeed, year: number): Date | null {
  const rule = seed.rule;
  if (!rule) return new Date(Date.UTC(year, seed.month - 1, seed.day));
  if (rule.kind === "lunar-in") {
    const known = indianFestivalDate(seed.label, year);
    return known ? new Date(Date.UTC(year, known.month - 1, known.day)) : null;
  }
  const monthIndex = seed.month - 1;
  let day: number;
  if (rule.n > 0) {
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    day = 1 + ((rule.weekday - firstWeekday + 7) % 7) + (rule.n - 1) * 7;
  } else {
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const lastWeekday = new Date(Date.UTC(year, monthIndex, lastDay)).getUTCDay();
    day = lastDay - ((lastWeekday - rule.weekday + 7) % 7);
  }
  return new Date(Date.UTC(year, monthIndex, day) + (rule.offsetDays ?? 0) * DAY_MS);
}

/**
 * Festival dates for a region (ISO UTC midnight), from a day before `from`. With `year`, that
 * year's dates; without, the next twelve months (so December still shows next year's festivals).
 */
export function regionFestivalDates(
  region: FitRegionPackId,
  opts?: { year?: number; from?: Date },
): Array<{ occasion: string; label: string; date: string }> {
  const from = opts?.from ?? new Date();
  const years = opts?.year != null ? [opts.year] : [from.getUTCFullYear(), from.getUTCFullYear() + 1];
  const until = opts?.year != null ? Number.POSITIVE_INFINITY : from.getTime() + 365 * DAY_MS;
  const pack = getRegionPackDefaults(region);
  return years
    .flatMap((year) =>
      pack.festivals.flatMap((f) => {
        const date = festivalDateInYear(f, year);
        return date ? [{ occasion: f.occasion, label: f.label, date: date.toISOString() }] : [];
      }),
    )
    .filter((f) => {
      const t = new Date(f.date).getTime();
      return t >= from.getTime() - DAY_MS && t < until;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function listRegionPackDefaults(): RegionPackDefaults[] {
  return (Object.keys(PACKS) as FitRegionPackId[]).map((r) => PACKS[r]);
}
