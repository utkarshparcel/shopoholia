/**
 * Week outfit calendar helpers (Mon–Sun).
 */
import { localDateKey } from "@worn/shared";

const DAY_MS = 86_400_000;

/**
 * Calendar YYYY-MM-DD of `d`: in `timeZone` when given (a user's day, C1), else UTC (only right
 * for dates that are already UTC midnights, such as `parseDateKey` results).
 */
export function toDateKey(d: Date, timeZone?: string): string {
  return timeZone ? localDateKey(d, timeZone) : d.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as UTC midnight. */
export function parseDateKey(key: string): Date {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1));
}

/**
 * Monday (UTC) of the ISO-ish week containing `date`.
 * Sunday → previous Monday.
 */
export function mondayOfWeek(date: Date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

export type WeekDayKey = {
  date: string;
  weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  isToday: boolean;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Seven Mon–Sun day descriptors for the week of `weekStart` (or the current week). With
 * `timeZone`, "today" and the current week are the user's (C1); without it, UTC.
 */
export function weekDayKeys(opts?: { weekStart?: string | Date; now?: Date; timeZone?: string }): WeekDayKey[] {
  const now = opts?.now ?? new Date();
  const todayKey = toDateKey(now, opts?.timeZone);
  let monday: Date;
  if (opts?.weekStart instanceof Date) {
    monday = mondayOfWeek(opts.weekStart);
  } else if (typeof opts?.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.weekStart)) {
    monday = mondayOfWeek(parseDateKey(opts.weekStart));
  } else {
    monday = mondayOfWeek(parseDateKey(todayKey));
  }
  return WEEKDAYS.map((weekday, i) => {
    const d = new Date(monday.getTime() + i * DAY_MS);
    const date = toDateKey(d);
    return { date, weekday, isToday: date === todayKey };
  });
}
