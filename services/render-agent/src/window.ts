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

function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

export function inWindow(at: Date, window: AgentWindow, timeZone: string): boolean {
  if (window.kind === "always") return true;
  const m = localMinutes(at, timeZone);
  const { startMin, endMin } = window;
  return startMin < endMin ? m >= startMin && m < endMin : m >= startMin || m < endMin;
}

/** Milliseconds until the window next opens (0 inside it). */
export function msUntilWindow(at: Date, window: AgentWindow, timeZone: string): number {
  if (window.kind === "always" || inWindow(at, window, timeZone)) return 0;
  const minutes = (window.startMin - localMinutes(at, timeZone) + 1440) % 1440;
  const intoMinute = at.getTime() % 60_000;
  return Math.max(0, minutes * 60_000 - intoMinute);
}
