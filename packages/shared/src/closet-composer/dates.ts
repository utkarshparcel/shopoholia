import { MONTHS, WEEKDAYS } from "../closet-notes.js";

/**
 * Date arithmetic on "YYYY-MM-DD" strings that `LocalDateSchema` has already checked.
 * Nothing here reads the clock.
 */

export const DAY_MS = 86_400_000;

/** Midnight UTC at the start of `date`, in ms. */
export function dayMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(dayMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(dayMs(date)).getUTCDay() + 6) % 7;
}

/** "Monday". */
export function weekdayName(date: string): string {
  return WEEKDAYS[weekday(date)];
}

/** "June". */
export function monthOf(timestamp: string): string {
  return MONTHS[new Date(Date.parse(timestamp)).getUTCMonth()];
}
