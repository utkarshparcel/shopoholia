/**
 * Week outfit calendar helpers (Mon–Sun).
 */

const DAY_MS = 86_400_000;

/** Format a Date as UTC calendar YYYY-MM-DD. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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

/** Seven Mon–Sun day descriptors for the week of `weekStart` (or current week). */
export function weekDayKeys(opts?: { weekStart?: string | Date; now?: Date }): WeekDayKey[] {
  const now = opts?.now ?? new Date();
  const todayKey = toDateKey(now);
  let monday: Date;
  if (opts?.weekStart instanceof Date) {
    monday = mondayOfWeek(opts.weekStart);
  } else if (typeof opts?.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.weekStart)) {
    monday = mondayOfWeek(parseDateKey(opts.weekStart));
  } else {
    monday = mondayOfWeek(now);
  }
  return WEEKDAYS.map((weekday, i) => {
    const d = new Date(monday.getTime() + i * DAY_MS);
    const date = toDateKey(d);
    return { date, weekday, isToday: date === todayKey };
  });
}
