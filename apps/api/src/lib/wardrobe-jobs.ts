import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@worn/shared";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

export const OUTFIT_QUEUE = "outfit-generation";
export const OUTFIT_JOB = "outfit-generate";

/** Default TZ for India-first Closet when the user has none (C1). */
export const DEFAULT_OUTFIT_TZ = DEFAULT_TIME_ZONE;
/** Local hour for the morning “your outfit today” push. */
export const OUTFIT_PUSH_LOCAL_HOUR = 7;

export type OutfitPayload = {
  userId: string;
  trigger: "nightly" | "manual" | "morning";
  timeZone?: string;
};

export type ScheduleMorningOutfitOpts = {
  timeZone?: string;
  now?: Date;
  /** Local hour to fire (default 7). */
  localHour?: number;
};

function formatParts(
  date: Date,
  timeZone: string,
): Record<string, string> {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
}

/** The user's IANA zone (C1: `users.time_zone`), or the default when unset or invalid. */
export function resolveUserTimeZone(
  user?: { timeZone?: string | null } | null,
): string {
  return resolveTimeZone(user?.timeZone);
}

/** Stable BullMQ jobId so re-scheduling replaces rather than duplicates. */
export function outfitJobId(userId: string, dayKey: string): string {
  return `outfit:${userId}:${dayKey}`;
}

/** YYYY-MM-DD in the user's local timezone. */
export function localDayKey(now: Date, timeZone: string): string {
  const p = formatParts(now, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * UTC ms for a wall-clock local datetime in `timeZone` (iterative offset fix).
 */
export function utcMsForLocalWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const p = formatParts(new Date(utc), timeZone);
    const asLocalMs = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = desired - asLocalMs;
    if (delta === 0) break;
    utc += delta;
  }
  return utc;
}

/**
 * Milliseconds until the next local `hour:00` in `timeZone`.
 * If `now` is exactly on the hour, schedules the following day (avoid 0-delay races).
 */
export function msUntilLocalHour(
  now: Date,
  timeZone: string,
  hour: number = OUTFIT_PUSH_LOCAL_HOUR,
): number {
  const p = formatParts(now, timeZone);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);
  const h = Number(p.hour);
  const min = Number(p.minute);

  let targetY = y;
  let targetM = m;
  let targetD = d;
  if (h > hour || (h === hour && min > 0)) {
    // Next calendar day in local TZ
    const noonUtc = utcMsForLocalWallClock(y, m, d, 12, 0, timeZone);
    const next = new Date(noonUtc + 24 * 60 * 60 * 1000);
    const np = formatParts(next, timeZone);
    targetY = Number(np.year);
    targetM = Number(np.month);
    targetD = Number(np.day);
  }

  const targetMs = utcMsForLocalWallClock(targetY, targetM, targetD, hour, 0, timeZone);
  const delay = targetMs - now.getTime();
  return Math.max(delay, 100);
}

/**
 * Schedules the morning outfit generation + push for ~7am in the user's TZ.
 * Throws QueueUnavailableError when Redis can't take the job; "skipped" only without Redis
 * outside production. Idempotent via the (user, local day) jobId.
 *
 * Quiet hours are enforced at delivery time in worker-wardrobe (not here),
 * so a 7am fire that lands inside an extended quiet window is delayed there.
 */
export async function scheduleMorningOutfit(
  userId: string,
  opts: ScheduleMorningOutfitOpts = {},
): Promise<"published" | "skipped"> {
  const now = opts.now ?? new Date();
  const timeZone = resolveTimeZone(opts.timeZone);
  const localHour = opts.localHour ?? OUTFIT_PUSH_LOCAL_HOUR;
  const delayMs = msUntilLocalHour(now, timeZone, localHour);

  // Day key for the morning the job will fire (local), not "now"
  const fireAt = new Date(now.getTime() + delayMs);
  const dayKey = localDayKey(fireAt, timeZone);
  const payload: OutfitPayload = {
    userId,
    trigger: "morning",
    timeZone,
  };
  const result = await enqueueJob(OUTFIT_QUEUE, OUTFIT_JOB, payload, {
    delay: delayMs,
    jobId: jobIdFrom(outfitJobId(userId, dayKey)),
  });
  return result.status === "queued" ? "published" : "skipped";
}

/** @deprecated Prefer scheduleMorningOutfit — kept for call-site compat. */
export async function scheduleNightlyOutfit(
  userId: string,
  opts: ScheduleMorningOutfitOpts = {},
): Promise<"published" | "skipped"> {
  return scheduleMorningOutfit(userId, opts);
}
