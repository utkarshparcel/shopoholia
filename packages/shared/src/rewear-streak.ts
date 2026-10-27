/**
 * Rewear streak — consecutive calendar days with at least one wear_log entry.
 * Optional: a new merchant purchase after the streak window starts resets progress
 * (anti-impulse / sustainability habit before new buy).
 */

const DAY_MS = 86_400_000;

/** Milestone days that warrant a celebrate push. */
export const REWEAR_STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export type RewearStreak = {
  /** Consecutive days ending today or yesterday (grace if today not logged). */
  currentStreak: number;
  /** Longest consecutive run in the wear history (after optional purchase floor). */
  longestStreak: number;
  /** True when there is a wear_log on today's calendar day. */
  todayLogged: boolean;
  /** Last calendar day (YYYY-MM-DD) with a wear, or null. */
  lastWearOn: string | null;
  /** When breakOnPurchase truncated the current run. */
  brokenByPurchase: boolean;
  /** Human label e.g. "5-day rewear streak". */
  label: string;
};

export type RewearStreakInput = {
  /** Wear timestamps (wornOn). */
  wearDates: Array<Date | string>;
  /** Optional purchase timestamps; only used when breakOnPurchase. */
  purchaseDates?: Array<Date | string>;
  /** When true, only wears strictly after the latest purchase count. Default false. */
  breakOnPurchase?: boolean;
  now?: Date;
};

/** Format a Date as UTC calendar YYYY-MM-DD. */
export function toUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseKey(key: string): Date {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1));
}

function prevKey(key: string): string {
  return toUtcDateKey(new Date(parseKey(key).getTime() - DAY_MS));
}

function uniqueDayKeys(dates: Array<Date | string>): Set<string> {
  const keys = new Set<string>();
  for (const raw of dates) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    keys.add(toUtcDateKey(d));
  }
  return keys;
}

/** Longest consecutive run within a sorted ascending list of day keys. */
function longestRun(sortedKeys: string[]): number {
  if (sortedKeys.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedKeys.length; i++) {
    const prev = parseKey(sortedKeys[i - 1]!).getTime();
    const cur = parseKey(sortedKeys[i]!).getTime();
    if (cur - prev === DAY_MS) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

/**
 * Count consecutive wear days ending at `anchor` (inclusive), walking backwards.
 */
function countBackwards(wearDays: Set<string>, anchor: string): number {
  let streak = 0;
  let cursor = anchor;
  while (wearDays.has(cursor)) {
    streak += 1;
    cursor = prevKey(cursor);
  }
  return streak;
}

export function rewearStreakLabel(currentStreak: number): string {
  if (currentStreak <= 0) return "No rewear streak yet";
  if (currentStreak === 1) return "1-day rewear streak";
  return `${currentStreak}-day rewear streak`;
}

export function rewearStreakNudgeCopy(streak: RewearStreak): string {
  if (streak.currentStreak <= 0) {
    return "Log a wear today to start a rewear streak.";
  }
  if (!streak.todayLogged) {
    return `Keep your ${streak.currentStreak}-day streak — log a wear today.`;
  }
  return "Logged today — keep rewearing before you buy.";
}

export function rewearStreakCelebrateCopy(currentStreak: number): string {
  return `Nice — ${rewearStreakLabel(currentStreak)}. Habit > haul.`;
}

/** True when current streak just hit a celebrate milestone. */
export function isRewearStreakMilestone(currentStreak: number): boolean {
  return (REWEAR_STREAK_MILESTONES as readonly number[]).includes(currentStreak);
}

/**
 * Compute rewear streak from wear_log (and optional purchase) dates.
 *
 * - A day counts if there is ≥1 wear_log that UTC calendar day.
 * - Current streak ends on today if logged, else yesterday (grace).
 * - With `breakOnPurchase`, wears on/before the latest purchase day are ignored
 *   for current + longest (purchase resets the habit window).
 */
export function computeRewearStreak(input: RewearStreakInput): RewearStreak {
  const now = input.now ?? new Date();
  const todayKey = toUtcDateKey(now);
  const yesterdayKey = prevKey(todayKey);

  let wearDays = uniqueDayKeys(input.wearDates);
  let brokenByPurchase = false;

  if (input.breakOnPurchase) {
    const purchaseDays = uniqueDayKeys(input.purchaseDates ?? []);
    if (purchaseDays.size > 0) {
      const latestPurchase = [...purchaseDays].sort().at(-1)!;
      const filtered = new Set<string>();
      for (const k of wearDays) {
        // Purchase day resets the window — only wears after that day count.
        if (k > latestPurchase) filtered.add(k);
      }
      brokenByPurchase = filtered.size < wearDays.size;
      wearDays = filtered;
    }
  }

  const todayLogged = wearDays.has(todayKey);
  const sorted = [...wearDays].sort();
  const longestStreak = longestRun(sorted);

  let currentStreak = 0;
  if (todayLogged) {
    currentStreak = countBackwards(wearDays, todayKey);
  } else if (wearDays.has(yesterdayKey)) {
    currentStreak = countBackwards(wearDays, yesterdayKey);
  }

  const lastWearOn = sorted.length > 0 ? sorted[sorted.length - 1]! : null;

  return {
    currentStreak,
    longestStreak,
    todayLogged,
    lastWearOn,
    brokenByPurchase,
    label: rewearStreakLabel(currentStreak),
  };
}
