/**
 * A user's local calendar from an IANA time zone, with `Intl` only (Node and Hermes).
 * Date keys are `YYYY-MM-DD` in the user's zone; weeks run Monday to Sunday.
 * Functions that take `tz` throw a RangeError for a name `Intl` rejects: pass
 * `resolveTimeZone(user.timeZone)` to them.
 */

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** IANA-style names only (`Area/City`, `UTC`, `Etc/GMT+5`); no raw offsets like `+05:30`. */
const TZ_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;
const MAX_CACHED_FORMATTERS = 500;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    if (formatters.size >= MAX_CACHED_FORMATTERS) formatters.clear();
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64 || !TZ_NAME.test(tz)) {
    return false;
  }
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

/**
 * `tz` as given when valid, else DEFAULT_TIME_ZONE. Not canonicalised: ICU's canonical name for
 * Asia/Kolkata is the legacy Asia/Calcutta.
 */
export function resolveTimeZone(tz?: string | null): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
};

type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function toMs(instant: Date | number): number {
  const ms = typeof instant === "number" ? instant : instant.getTime();
  if (!Number.isFinite(ms)) throw new RangeError("Invalid instant");
  return ms;
}

function wallParts(ms: number, tz: string): WallParts {
  const out: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    // Some engines print midnight as 24 even with h23.
    hour: out.hour === 24 ? 0 : out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

/** The local wall clock at `ms`, read as if it were UTC. */
function wallAsUtcMs(ms: number, tz: string): number {
  const p = wallParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function isoWeekdayOfUtcMs(ms: number): number {
  const d = new Date(ms).getUTCDay();
  return d === 0 ? 7 : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function keyFromUtcMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const m = DATE_KEY.exec(dateKey);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
      return { year, month, day };
    }
  }
  throw new RangeError(`Invalid date key: ${dateKey}`);
}

function parseHhMm(hhmm: string): { hour: number; minute: number } {
  const m = HH_MM.exec(hhmm);
  if (!m) throw new RangeError(`Invalid time (expected HH:MM): ${hhmm}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function localParts(instant: Date | number, tz: string): LocalParts {
  const p = wallParts(toMs(instant), tz);
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    weekday: isoWeekdayOfUtcMs(Date.UTC(p.year, p.month - 1, p.day)),
  };
}

export function localDateKey(instant: Date | number, tz: string): string {
  const p = wallParts(toMs(instant), tz);
  return `${String(p.year).padStart(4, "0")}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function addDaysToKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  return keyFromUtcMs(Date.UTC(year, month - 1, day + Math.trunc(days)));
}

/** The Monday of the week holding `dateKey`. */
export function weekStartKey(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const iso = isoWeekdayOfUtcMs(Date.UTC(year, month - 1, day));
  return addDaysToKey(dateKey, 1 - iso);
}

/** Monday to Sunday of the week holding `weekStart` (normally already a Monday). */
export function weekDateKeys(weekStart: string): string[] {
  const monday = weekStartKey(weekStart);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
}

/** Every instant whose local wall clock in `tz` reads `dateKey hhmm`, earliest first. */
function wallTimeInstants(dateKey: string, hhmm: string, tz: string): number[] {
  const { year, month, day } = parseDateKey(dateKey);
  const { hour, minute } = parseHhMm(hhmm);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set([
    wallAsUtcMs(wall - DAY_MS, tz) - (wall - DAY_MS),
    wallAsUtcMs(wall, tz) - wall,
    wallAsUtcMs(wall + DAY_MS, tz) - (wall + DAY_MS),
  ]);
  const hits = [...offsets].map((o) => wall - o).filter((t) => wallAsUtcMs(t, tz) === wall);
  return [...new Set(hits)].sort((a, b) => a - b);
}

/**
 * The instant at local `hhmm` on `dateKey` in `tz`.
 * A wall time that occurs twice (clocks go back) gives the earlier instant. One that doesn't
 * exist (clocks go forward) gives the instant the gap's length later: New York 02:30 on the
 * spring-forward day is 03:30 EDT.
 */
export function zonedTimeToInstant(dateKey: string, hhmm: string, tz: string): Date {
  const hits = wallTimeInstants(dateKey, hhmm, tz);
  if (hits.length > 0) return new Date(hits[0]!);
  const { year, month, day } = parseDateKey(dateKey);
  const { hour, minute } = parseHhMm(hhmm);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsetBefore = wallAsUtcMs(wall - DAY_MS, tz) - (wall - DAY_MS);
  return new Date(wall - offsetBefore);
}

export type LocalRange = { start: Date; end: Date };

/** `[start, end)` of the local day `dateKey`. */
export function localDayRange(dateKey: string, tz: string): LocalRange & { dateKey: string } {
  return {
    start: zonedTimeToInstant(dateKey, "00:00", tz),
    end: zonedTimeToInstant(addDaysToKey(dateKey, 1), "00:00", tz),
    dateKey,
  };
}

/** `[start, end)` of the local month holding `instant`, and its `YYYY-MM` key. */
export function localMonthRange(
  instant: Date | number,
  tz: string,
): LocalRange & { monthKey: string } {
  const p = wallParts(toMs(instant), tz);
  const monthKey = `${String(p.year).padStart(4, "0")}-${pad2(p.month)}`;
  const next = p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 };
  return {
    start: zonedTimeToInstant(`${monthKey}-01`, "00:00", tz),
    end: zonedTimeToInstant(`${String(next.year).padStart(4, "0")}-${pad2(next.month)}-01`, "00:00", tz),
    monthKey,
  };
}

/**
 * Whether local time in `tz` is inside the quiet window `[start, end)` (HH:MM). A window whose
 * start is after its end crosses midnight (22:00–07:00). Equal start and end means no window.
 */
export function isInLocalQuietHours(
  instant: Date | number,
  start: string,
  end: string,
  tz: string,
): boolean {
  const s = parseHhMm(start);
  const e = parseHhMm(end);
  const startMin = s.hour * 60 + s.minute;
  const endMin = e.hour * 60 + e.minute;
  if (startMin === endMin) return false;
  const p = wallParts(toMs(instant), tz);
  const mins = p.hour * 60 + p.minute;
  return startMin < endMin ? mins >= startMin && mins < endMin : mins >= startMin || mins < endMin;
}

/** `instant` when outside quiet hours, else the instant the window ends in local time. */
export function nextLocalSendAt(
  instant: Date | number,
  start: string,
  end: string,
  tz: string,
): Date {
  const ms = toMs(instant);
  if (!isInLocalQuietHours(ms, start, end, tz)) return new Date(ms);
  const s = parseHhMm(start);
  const e = parseHhMm(end);
  const p = wallParts(ms, tz);
  const mins = p.hour * 60 + p.minute;
  const today = `${String(p.year).padStart(4, "0")}-${pad2(p.month)}-${pad2(p.day)}`;
  const crossesMidnight = s.hour * 60 + s.minute > e.hour * 60 + e.minute;
  const endDay = crossesMidnight && mins >= s.hour * 60 + s.minute ? addDaysToKey(today, 1) : today;
  const later = wallTimeInstants(endDay, end, tz).find((t) => t > ms);
  if (later !== undefined) return new Date(later);
  const shifted = zonedTimeToInstant(endDay, end, tz).getTime();
  return new Date(Math.max(shifted, ms));
}
