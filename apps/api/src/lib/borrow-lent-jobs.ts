/**
 * Overdue lent-item nudge (N25-BORROW-LENT).
 * Schedules onto the wardrobe Redis queue family; worker-wardrobe can process.
 */
import {
  localDayKey,
  utcMsForLocalWallClock,
  DEFAULT_OUTFIT_TZ,
} from "./wardrobe-jobs.js";
import { resolveTimeZone, type sendExpoPush } from "@worn/shared";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";
import type { RecordPushEventInput } from "./repositories/types.js";

export const LENT_OVERDUE_QUEUE = "lent-overdue";
export const LENT_OVERDUE_JOB = "lent-overdue-nudge";
export const LENT_OVERDUE_EVENT = "LENT_OVERDUE";

/** Local hour for overdue nudge. */
export const LENT_OVERDUE_PUSH_LOCAL_HOUR = 10;

export type LentOverduePayload = {
  userId: string;
  wardrobeItemId: string;
  lentTo: string;
  dueOn: string;
  category?: string;
  timeZone?: string;
};

export function lentOverdueJobId(wardrobeItemId: string, dueOn: string): string {
  return `lent:${wardrobeItemId}:${dueOn}`;
}

/**
 * Delay until local morning on the day after due (first overdue day).
 * If already past that morning, fire ASAP. If due day is in the future, wait.
 */
export function computeLentOverdueDelayMs(
  dueOn: string,
  opts: { now?: Date; timeZone?: string; localHour?: number } = {},
): number | null {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? DEFAULT_OUTFIT_TZ;
  const localHour = opts.localHour ?? LENT_OVERDUE_PUSH_LOCAL_HOUR;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueOn);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Nudge on the calendar day after due (first overdue morning)
  const dueDate = new Date(Date.UTC(y, mo - 1, d));
  dueDate.setUTCDate(dueDate.getUTCDate() + 1);
  const nudgeY = dueDate.getUTCFullYear();
  const nudgeMo = dueDate.getUTCMonth() + 1;
  const nudgeD = dueDate.getUTCDate();
  const nudgeDay = `${nudgeY}-${String(nudgeMo).padStart(2, "0")}-${String(nudgeD).padStart(2, "0")}`;
  const targetMs = utcMsForLocalWallClock(nudgeY, nudgeMo, nudgeD, localHour, 0, timeZone);
  const todayKey = localDayKey(now, timeZone);
  if (nudgeDay < todayKey) return 100; // already overdue — nudge ASAP
  if (nudgeDay === todayKey && now.getTime() >= targetMs) return 100;
  const delay = targetMs - now.getTime();
  return delay <= 0 ? 100 : delay;
}

/**
 * Throws QueueUnavailableError when Redis can't take the job; "skipped" means a bad due date,
 * or no Redis outside production.
 */
export async function scheduleLentOverdueNudge(
  payload: LentOverduePayload,
  opts: { now?: Date; timeZone?: string } = {},
): Promise<"published" | "skipped"> {
  const timeZone = resolveTimeZone(opts.timeZone ?? payload.timeZone);
  const delayMs = computeLentOverdueDelayMs(payload.dueOn, {
    now: opts.now,
    timeZone,
  });
  if (delayMs === null) return "skipped";

  const result = await enqueueJob(
    LENT_OVERDUE_QUEUE,
    LENT_OVERDUE_JOB,
    { ...payload, timeZone },
    {
      delay: delayMs,
      jobId: jobIdFrom(lentOverdueJobId(payload.wardrobeItemId, payload.dueOn)),
    },
  );
  return result.status === "queued" ? "published" : "skipped";
}

/**
 * Sends the overdue push unless the item is gone, came back, or was lent again with another
 * due date. Safe to run twice: the push row is keyed on (item, due date).
 */
export async function processLentOverdueNudge(
  payload: LentOverduePayload,
  repos: {
    recordPushEvent: (
      input: RecordPushEventInput,
    ) => Promise<{ id: string; status?: "QUEUED" | "SENT" | "FAILED" }>;
    findUserById?: (id: string) => Promise<{
      prefs?: Record<string, unknown> | null;
      timeZone?: string | null;
      pushToken?: string | null;
    } | null>;
    findWardrobeItem?: (
      id: string,
      userId: string,
    ) => Promise<{
      lentTo?: string | null;
      lentDueOn?: string | null;
      category?: string;
    } | null>;
    updatePushEventStatus?: (
      id: string,
      status: "SENT" | "FAILED",
      expoTicketId?: string | null,
    ) => Promise<void>;
  },
  opts: { now?: Date; sendExpo?: typeof sendExpoPush; asOf?: string } = {},
) {
  const item = repos.findWardrobeItem
    ? await repos.findWardrobeItem(payload.wardrobeItemId, payload.userId)
    : undefined;
  if (item === null) return { status: "skipped" as const, reason: "item_gone" };
  if (item) {
    const stillLent = Boolean((item.lentTo ?? "").trim());
    if (!stillLent) return { status: "skipped" as const, reason: "returned" };
    if (item.lentDueOn && item.lentDueOn !== payload.dueOn) {
      return { status: "skipped" as const, reason: "due_date_changed" };
    }
  }

  const { runClosetPushDelivery } = await import("@worn/shared");
  const user = repos.findUserById
    ? await repos.findUserById(payload.userId)
    : { prefs: {}, timeZone: null, pushToken: null };
  if (!user) return { status: "skipped" as const, reason: "user_gone" };
  // Run early (a promoted or replayed job): not overdue yet on the user's clock, so wait.
  const untilOverdueMs = computeLentOverdueDelayMs(payload.dueOn, {
    now: opts.now,
    timeZone: resolveTimeZone(user.timeZone ?? payload.timeZone),
  });
  if (untilOverdueMs !== null && untilOverdueMs > 1_000) {
    return { status: "delayed" as const, delayMs: untilOverdueMs };
  }
  const label = payload.category ?? item?.category ?? "item";
  const who = payload.lentTo || item?.lentTo || "friend";
  return runClosetPushDelivery({
    eventType: LENT_OVERDUE_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: "Lent item overdue",
    body: `${label} with ${who} was due ${payload.dueOn}`,
    deepLinkExtra: { wardrobeItemId: payload.wardrobeItemId },
    payloadExtra: {
      wardrobeItemId: payload.wardrobeItemId,
      lentTo: payload.lentTo,
      dueOn: payload.dueOn,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: LENT_OVERDUE_EVENT,
        dedupeKey: lentOverdueJobId(payload.wardrobeItemId, payload.dueOn),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}
