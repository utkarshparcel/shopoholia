/**
 * India festival calendar helpers for gift occasion countdowns.
 * Approximate Gregorian dates for common festivals (Diwali/Rakhi drift yearly).
 */

export type FestivalSeed = {
  occasion: string;
  date: string; // ISO datetime
  label: string;
};

/** Known IN festival dates for 2025–2027 (seed / demo). */
const IN_FESTIVAL_SEEDS: Array<{ year: number; occasion: string; label: string; month: number; day: number }> = [
  { year: 2025, occasion: "FESTIVAL", label: "Diwali", month: 10, day: 20 },
  { year: 2025, occasion: "FESTIVAL", label: "Rakhi", month: 8, day: 9 },
  { year: 2025, occasion: "FESTIVAL", label: "Holi", month: 3, day: 14 },
  { year: 2026, occasion: "FESTIVAL", label: "Diwali", month: 11, day: 8 },
  { year: 2026, occasion: "FESTIVAL", label: "Rakhi", month: 8, day: 28 },
  { year: 2026, occasion: "FESTIVAL", label: "Holi", month: 3, day: 3 },
  { year: 2027, occasion: "FESTIVAL", label: "Diwali", month: 10, day: 29 },
  { year: 2027, occasion: "FESTIVAL", label: "Rakhi", month: 8, day: 17 },
  { year: 2027, occasion: "FESTIVAL", label: "Holi", month: 3, day: 22 },
];

export function indianFestivalDates(opts?: { year?: number; from?: Date }): FestivalSeed[] {
  const from = opts?.from ?? new Date();
  const yearFilter = opts?.year;
  return IN_FESTIVAL_SEEDS.filter((f) => (yearFilter == null ? true : f.year === yearFilter))
    .map((f) => ({
      occasion: f.occasion,
      label: f.label,
      date: new Date(Date.UTC(f.year, f.month - 1, f.day, 0, 0, 0)).toISOString(),
    }))
    .filter((f) => new Date(f.date).getTime() >= from.getTime() - 86_400_000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export type OccasionDate = {
  occasion: string;
  date: string;
  label?: string;
};

export type NextOccasion = {
  occasion: string;
  label: string;
  date: string;
  daysUntil: number;
};

/**
 * Pick the soonest upcoming occasion (including today). Birthday/anniversary
 * dates without a year are treated as annual — but our schema stores full ISO.
 */
export function computeNextOccasion(
  dates: OccasionDate[],
  now: Date = new Date(),
): NextOccasion | null {
  if (!dates.length) return null;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best: NextOccasion | null = null;

  for (const d of dates) {
    const raw = new Date(d.date);
    if (Number.isNaN(raw.getTime())) continue;
    let target = Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
    // Recurring personal occasions: if the stored year is in the past, roll forward.
    const isPersonal = /birthday|anniversary/i.test(d.occasion) || /birthday|anniversary/i.test(d.label ?? "");
    if (isPersonal && target < startOfToday) {
      target = Date.UTC(now.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
      if (target < startOfToday) {
        target = Date.UTC(now.getUTCFullYear() + 1, raw.getUTCMonth(), raw.getUTCDate());
      }
    }
    if (target < startOfToday) continue;
    const daysUntil = Math.round((target - startOfToday) / 86_400_000);
    const label = d.label?.trim() || prettyOccasion(d.occasion);
    if (!best || daysUntil < best.daysUntil) {
      best = {
        occasion: d.occasion,
        label,
        date: new Date(target).toISOString(),
        daysUntil,
      };
    }
  }
  return best;
}

function prettyOccasion(occasion: string): string {
  const map: Record<string, string> = {
    BIRTHDAY: "Birthday",
    ANNIVERSARY: "Anniversary",
    FESTIVAL: "Festival",
    HOUSEWARMING: "Housewarming",
    GRADUATION: "Graduation",
    OTHER: "Occasion",
  };
  return map[occasion.toUpperCase()] ?? occasion;
}

/** Multi-day wedding / festival span for wardrobe planners (N39). */
export type MultiDayOccasionSpan = {
  kind: "wedding" | "festival";
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dayCount: number;
};

const DAY_MS = 86_400_000;

function toUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) + days * DAY_MS;
  return toUtcDateKey(new Date(t));
}

/**
 * Default multi-day span for a festival/wedding label.
 * Weddings → 3 days (mehendi → ceremony → reception); most festivals → 1–2 days.
 */
export function multiDayOccasionSpan(opts: {
  kind: "wedding" | "festival";
  label: string;
  /** Primary / main day YYYY-MM-DD or ISO datetime. */
  primaryDate: string;
  /** Override inclusive day count (clamped 1–14). */
  dayCount?: number;
}): MultiDayOccasionSpan {
  const primaryKey = opts.primaryDate.slice(0, 10);
  let dayCount = opts.dayCount;
  if (dayCount == null) {
    if (opts.kind === "wedding") {
      dayCount = 3;
    } else if (/diwali|holi|navratri|eid/i.test(opts.label)) {
      dayCount = 2;
    } else {
      dayCount = 1;
    }
  }
  dayCount = Math.min(14, Math.max(1, Math.floor(dayCount)));
  const startOffset = opts.kind === "wedding" ? -(dayCount - 1) : -(dayCount - 1);
  // Main day is last day of the span (ceremony / festival climax).
  const startDate = addUtcDays(primaryKey, startOffset);
  const endDate = primaryKey;
  // Recompute when dayCount=1 so start===end
  if (dayCount === 1) {
    return {
      kind: opts.kind,
      label: opts.label.trim() || (opts.kind === "wedding" ? "Wedding" : "Festival"),
      startDate: primaryKey,
      endDate: primaryKey,
      dayCount: 1,
    };
  }
  return {
    kind: opts.kind,
    label: opts.label.trim() || (opts.kind === "wedding" ? "Wedding" : "Festival"),
    startDate,
    endDate,
    dayCount,
  };
}
