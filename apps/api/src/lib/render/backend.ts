/**
 * Which renderer makes reveal and try-on images, and when the render agent (the owner's Mac)
 * is expected to be working. See docs/RENDER_AGENT.md.
 */

export type RenderBackend = "agent" | "fashn" | "mock";
export type RenderOverflow = "none" | "fashn";
export type FashnResolution = "1k" | "2k" | "4k";

/** `always`, or a daily range in minutes since local midnight; `start > end` wraps past midnight. */
export type AgentWindow = { kind: "always" } | { kind: "range"; startMin: number; endMin: number };

export type RenderConfig = {
  backend: RenderBackend;
  window: AgentWindow;
  timeZone: string;
  overflow: RenderOverflow;
  /** Overflow to FASHN can run: RENDER_OVERFLOW=fashn and a FASHN key is set. */
  overflowReady: boolean;
  /** RENDER_AGENT_TOKEN, or null (the agent routes then refuse everyone). */
  agentToken: string | null;
  fashnResolution: FashnResolution;
  /** How long an agent's lease lasts before the job goes back to the queue. */
  leaseMs: number;
  /** How long the overflow renderer holds a job (FASHN with its retries). */
  overflowLeaseMs: number;
  /** Leases a job may take before it fails (and a paid render is refunded). */
  maxAttempts: number;
  /** No heartbeat for this long: the agent counts as down. */
  heartbeatStaleMs: number;
  /** Inside the window with the agent up, overflow takes a job still unleased after this long. */
  overflowAfterMs: number;
  /** Queued jobs and no heartbeat for this long: report the agent as down (log and Sentry). */
  alertAfterMs: number;
  /** Seconds the agent takes per render, all in; used to estimate when a reveal is ready. */
  avgRenderSeconds: number;
  /** Added to an estimated ready time, so the app promises a little late rather than early. */
  readyMarginMs: number;
};

const MINUTE_MS = 60_000;

/** Parses `HH:MM-HH:MM` or `always`; null when it is neither (or the range is empty). */
export function parseAgentWindow(value: string | undefined): AgentWindow | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "" || raw === "always") return { kind: "always" };
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const [h1, m1, h2, m2] = match.slice(1).map(Number) as [number, number, number, number];
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  const startMin = h1 * 60 + m1;
  const endMin = h2 * 60 + m2;
  if (startMin === endMin) return null;
  return { kind: "range", startMin, endMin };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type Env = Record<string, string | undefined>;

/**
 * RENDER_BACKEND defaults to what it was before the agent existed: fashn with a FASHN key, else
 * mock (production without a key has no renderer at all).
 */
export function resolveRenderBackend(env: Env = process.env): RenderBackend {
  const raw = env.RENDER_BACKEND?.trim().toLowerCase();
  if (raw === "agent" || raw === "fashn" || raw === "mock") return raw;
  return env.FASHN_API_KEY?.trim() ? "fashn" : "mock";
}

export function resolveRenderConfig(env: Env = process.env): RenderConfig {
  const overflow: RenderOverflow = env.RENDER_OVERFLOW?.trim().toLowerCase() === "fashn" ? "fashn" : "none";
  const resolution = env.FASHN_RESOLUTION?.trim().toLowerCase();
  const timeZone = env.RENDER_AGENT_TIME_ZONE?.trim() || "Asia/Kolkata";
  return {
    backend: resolveRenderBackend(env),
    window: parseAgentWindow(env.RENDER_AGENT_WINDOW) ?? { kind: "always" },
    timeZone: isValidTimeZone(timeZone) ? timeZone : "Asia/Kolkata",
    overflow,
    overflowReady: overflow === "fashn" && Boolean(env.FASHN_API_KEY?.trim()),
    agentToken: env.RENDER_AGENT_TOKEN?.trim() || null,
    fashnResolution: resolution === "2k" || resolution === "4k" ? resolution : "1k",
    leaseMs: positiveNumber(env.RENDER_AGENT_LEASE_MINUTES, 10) * MINUTE_MS,
    overflowLeaseMs: 30 * MINUTE_MS,
    maxAttempts: Math.floor(positiveNumber(env.RENDER_AGENT_MAX_ATTEMPTS, 3)),
    heartbeatStaleMs: 3 * MINUTE_MS,
    overflowAfterMs: positiveNumber(env.RENDER_OVERFLOW_AFTER_MINUTES, 15) * MINUTE_MS,
    alertAfterMs: 5 * MINUTE_MS,
    avgRenderSeconds: positiveNumber(env.RENDER_AGENT_AVG_RENDER_SECONDS, 60),
    readyMarginMs: 30 * MINUTE_MS,
  };
}

/** Minutes since local midnight in `timeZone`. */
export function localMinutes(at: Date, timeZone: string): number {
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

export function inAgentWindow(at: Date, window: AgentWindow, timeZone: string): boolean {
  if (window.kind === "always") return true;
  const m = localMinutes(at, timeZone);
  const { startMin, endMin } = window;
  return startMin < endMin ? m >= startMin && m < endMin : m >= startMin || m < endMin;
}

function atMinuteOffset(at: Date, minutes: number): Date {
  const floored = Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS;
  return new Date(floored + minutes * MINUTE_MS);
}

/**
 * When the window next opens: `at` itself inside it (or for `always`). Local clock arithmetic,
 * so a daylight-saving change on that night can move it by an hour.
 */
export function nextWindowStart(at: Date, window: AgentWindow, timeZone: string): Date {
  if (window.kind === "always" || inAgentWindow(at, window, timeZone)) return at;
  const m = localMinutes(at, timeZone);
  return atMinuteOffset(at, (window.startMin - m + 1440) % 1440);
}

/** When the current window closes, or the next one if outside it; null for `always`. */
export function windowEndAfter(at: Date, window: AgentWindow, timeZone: string): Date | null {
  if (window.kind === "always") return null;
  const m = localMinutes(at, timeZone);
  if (inAgentWindow(at, window, timeZone)) {
    return atMinuteOffset(at, (window.endMin - m + 1440) % 1440);
  }
  const toStart = (window.startMin - m + 1440) % 1440;
  const length = (window.endMin - window.startMin + 1440) % 1440;
  return atMinuteOffset(at, toStart + length);
}
