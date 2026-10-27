import { formatClosetDate } from '@/src/lib/format';

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The calendar day (YYYY-MM-DD) on the device clock, `days` after `at`.
 * `toISOString().slice(0, 10)` is the UTC day, which in India is still
 * yesterday until 05:30.
 */
export function localDayKey(at: Date = new Date(), days = 0): string {
  const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() + Math.trunc(days));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** A typed YYYY-MM-DD that names a real calendar day, or null (2026-02-30 is null). */
export function parseDayKey(raw: string): string | null {
  const t = raw.trim();
  const m = DAY_KEY.exec(t);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return t;
}

/**
 * The last second of a day key on the device clock, as an ISO instant; null
 * for anything but a real YYYY-MM-DD. `${key}T23:59:59Z` ends the day at
 * 05:29 the next morning in India.
 */
export function endOfDayKeyIso(raw: string): string | null {
  const key = parseDayKey(raw);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

/**
 * The day key `months` calendar months later, clamped to the end of a shorter
 * month (31 Jan + 1 is 28 Feb); null for anything but a real YYYY-MM-DD.
 */
export function addMonthsToDayKey(raw: string, months: number): string | null {
  const key = parseDayKey(raw);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + Math.trunc(months), 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(Math.min(d, lastDay))}`;
}

/**
 * "29 Oct 2026" for a day key. `new Date('2026-10-29')` is UTC midnight, which
 * west of UTC is still the 28th, so a day key is read as a local date.
 */
export function formatDayKey(value: string): string {
  const key = parseDayKey(value);
  if (!key) return formatClosetDate(value);
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return formatClosetDate(new Date(y, m - 1, d));
}
