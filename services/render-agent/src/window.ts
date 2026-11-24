/**
 * The agent's working window, in a time zone: `always`, or `HH:MM-HH:MM` (which may wrap past
 * midnight, like 23:00-06:30). Mirrors the API's RENDER_AGENT_WINDOW.
 */

export type AgentWindow = { kind: "always" } | { kind: "range"; startMin: number; endMin: number };

export function parseWindow(value: string | undefined): AgentWindow {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "" || raw === "always") return { kind: "always" };
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) throw new Error(`RENDER_AGENT_WINDOW=${value} is not understood: use always or HH:MM-HH:MM`);
  const [h1, m1, h2, m2] = match.slice(1).map(Number) as [number, number, number, number];
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) throw new Error(`RENDER_AGENT_WINDOW=${value} has an invalid time`);
  const startMin = h1 * 60 + m1;
  const endMin = h2 * 60 + m2;
  if (startMin === endMin) throw new Error(`RENDER_AGENT_WINDOW=${value} is empty`);
  return { kind: "range", startMin, endMin };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type LocalParts = { year: number; month: number; day: number; minutes: number };

function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), minutes: (get("hour") % 24) * 60 + get("minute") };
}

/** The zone's offset from UTC at the instant `ms`, in milliseconds (seconds dropped). */
function offsetMsAt(ms: number, timeZone: string): number {
  const local = localParts(new Date(ms), timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, 0, local.minutes);
  return asUtc - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

/**
 * The instants at which the local clock reads `minutes` on the local day `year-month-day` (`day`
 * may overflow into the next month): usually one; two when the clocks go back over that time;
 * none in the hour skipped when they go forward, and then the instant the old offset gives
 * (01:30 in a skipped 01:00-02:00 is when the clock shows 02:30). Offsets are read at the actual
 * instants, so daylight saving is right.
 */
function instantsAtLocalTime(year: number, month: number, day: number, minutes: number, timeZone: string): number[] {
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  // The real instants are within 14 h of `wall`; one sample either side sees both offsets.
  const before = offsetMsAt(wall - 15 * HOUR_MS, timeZone);
  const after = offsetMsAt(wall + 15 * HOUR_MS, timeZone);
  const found = [...new Set([before, after])]
    .map((offset) => wall - offset)
    .filter((ms) => offsetMsAt(ms, timeZone) === wall - ms)
    .sort((a, b) => a - b);
  return found.length > 0 ? found : [wall - before];
}

/** The first instant after `at` at which the local clock reads `minutes`. */
function nextLocalTime(at: Date, minutes: number, timeZone: string): Date {
  const today = localParts(at, timeZone);
  for (let days = 0; days <= 2; days += 1) {
    for (const ms of instantsAtLocalTime(today.year, today.month, today.day + days, minutes, timeZone)) {
      if (ms > at.getTime()) return new Date(ms);
    }
  }
  // Unreachable: some day in the next three has that local time after `at`.
  return new Date(at.getTime() + 24 * HOUR_MS);
}

export function inWindow(at: Date, window: AgentWindow, timeZone: string): boolean {
  if (window.kind === "always") return true;
  const m = localParts(at, timeZone).minutes;
  const { startMin, endMin } = window;
  return startMin < endMin ? m >= startMin && m < endMin : m >= startMin || m < endMin;
}

/** When the window next opens (`at` itself inside it), right across daylight-saving changes. */
export function nextWindowStart(at: Date, window: AgentWindow, timeZone: string): Date {
  if (window.kind === "always" || inWindow(at, window, timeZone)) return at;
  return nextLocalTime(at, window.startMin, timeZone);
}

/** Milliseconds until the window next opens (0 inside it). */
export function msUntilWindow(at: Date, window: AgentWindow, timeZone: string): number {
  return Math.max(0, nextWindowStart(at, window, timeZone).getTime() - at.getTime());
}
