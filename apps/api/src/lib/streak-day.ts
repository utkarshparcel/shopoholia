import { addDaysToKey, localDateKey, resolveTimeZone } from "@worn/shared";

/** The zone a streak day is counted in: the user's, or the app default (as everywhere else) when it is missing or unknown. */
export function streakTimeZone(timeZone: string | null | undefined): string {
  return resolveTimeZone(timeZone);
}

export type StreakDay = {
  /** Today's date key (`YYYY-MM-DD`) in the user's zone. */
  todayKey: string;
  /** The last claim fell on today, local time. */
  claimedToday: boolean;
  /** The streak is still going: the last claim was today or yesterday, local time. */
  alive: boolean;
};

/** Where a user stands on their daily streak at `at`, counted in their own calendar days. */
export function streakDay(
  lastClaimAt: Date | null,
  at: Date,
  timeZone: string | null | undefined,
): StreakDay {
  const tz = streakTimeZone(timeZone);
  const todayKey = localDateKey(at, tz);
  if (!lastClaimAt) return { todayKey, claimedToday: false, alive: false };
  const lastKey = localDateKey(lastClaimAt, tz);
  const claimedToday = lastKey === todayKey;
  return { todayKey, claimedToday, alive: claimedToday || lastKey === addDaysToKey(todayKey, -1) };
}

/**
 * The streak day the user's next paid claim lands on: the day after their current streak while it
 * is alive (tomorrow's, once today is claimed), and day 1 once a day was missed.
 */
export function nextStreakDay(streakCount: number, day: StreakDay): number {
  return day.alive ? streakCount + 1 : 1;
}
