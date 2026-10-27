/**
 * Day-of dry-clean pickup push (N22-DRYCLEAN-TRACK).
 * Schedules onto the wardrobe Redis queue family; worker-wardrobe can process.
 */
import {
  localDayKey,
  utcMsForLocalWallClock,
  DEFAULT_OUTFIT_TZ,
} from "./wardrobe-jobs.js";
import { resolveTimeZone, type sendExpoPush } from "@worn/shared";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

export const DRY_CLEAN_QUEUE = "dry-clean-pickup";
export const DRY_CLEAN_JOB = "dry-clean-pickup-reminder";
export const DRY_CLEAN_PICKUP_EVENT = "DRY_CLEAN_PICKUP";

/** Local hour for “pickup today” nudge (metro India mornings). */
export const DRY_CLEAN_PUSH_LOCAL_HOUR = 9;

export type DryCleanPickupPayload = {
  userId: string;
  wardrobeItemId: string;
  ticket: string;
  pickupOn: string;
  category?: string;
  timeZone?: string;
};

export function dryCleanPickupJobId(wardrobeItemId: string, pickupOn: string): string {
  return `dryclean:${wardrobeItemId}:${pickupOn}`;
}

/**
 * Delay until local morning on pickup day.
 * If already on/after that morning but still that day, fire ASAP (100ms).
 * If pickup day is past, return null (skip).
 */
export function computeDryCleanPickupDelayMs(
  pickupOn: string,
  opts: { now?: Date; timeZone?: string; localHour?: number } = {},
): number | null {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? DEFAULT_OUTFIT_TZ;
  const localHour = opts.localHour ?? DRY_CLEAN_PUSH_LOCAL_HOUR;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pickupOn);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const targetMs = utcMsForLocalWallClock(y, mo, d, localHour, 0, timeZone);
  const todayKey = localDayKey(now, timeZone);
  if (pickupOn < todayKey) return null;
  if (pickupOn === todayKey && now.getTime() >= targetMs) return 100;
  const delay = targetMs - now.getTime();
  return delay <= 0 ? 100 : delay;
}

export async function scheduleDryCleanPickup(
  payload: DryCleanPickupPayload,
  opts: { now?: Date; timeZone?: string } = {},
): Promise<"published" | "skipped"> {
  const timeZone = resolveTimeZone(opts.timeZone ?? payload.timeZone);
  const delayMs = computeDryCleanPickupDelayMs(payload.pickupOn, {
    now: opts.now,
    timeZone,
  });
  if (delayMs === null) return "skipped";

  // Throws QueueUnavailableError when Redis can't take it; "skipped" only without Redis off-prod.
  const result = await enqueueJob(
    DRY_CLEAN_QUEUE,
    DRY_CLEAN_JOB,
    { ...payload, timeZone },
    {
      delay: delayMs,
      jobId: jobIdFrom(dryCleanPickupJobId(payload.wardrobeItemId, payload.pickupOn)),
    },
  );
  return result.status === "queued" ? "published" : "skipped";
}

export async function processDryCleanPickup(
  payload: DryCleanPickupPayload,
  repos: {
    recordPushEvent: (
      input: Record<string, unknown>,
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
      dryCleanTicket?: string | null;
      laundryStatus?: string | null;
      category?: string;
    } | null>;
    updatePushEventStatus?: (
      id: string,
      status: "SENT" | "FAILED",
      expoTicketId?: string | null,
    ) => Promise<void>;
  },
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const item = await repos.findWardrobeItem?.(payload.wardrobeItemId, payload.userId);
  if (item) {
    const stillOut =
      (item.dryCleanTicket ?? "").trim().length > 0 && item.laundryStatus === "IN_LAUNDRY";
    if (!stillOut) return { status: "skipped" as const, reason: "not_at_cleaner" };
  }

  const { runClosetPushDelivery } = await import("@worn/shared");
  const user = repos.findUserById
    ? await repos.findUserById(payload.userId)
    : { prefs: {}, timeZone: null, pushToken: null };
  if (!user) return { status: "skipped" as const, reason: "user_gone" };
  const label = payload.category ?? item?.category ?? "item";
  return runClosetPushDelivery({
    eventType: DRY_CLEAN_PICKUP_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: "Dry-clean pickup today",
    body: `Ticket ${payload.ticket} · ${label} ready for pickup`,
    deepLinkExtra: { wardrobeItemId: payload.wardrobeItemId },
    payloadExtra: {
      wardrobeItemId: payload.wardrobeItemId,
      ticket: payload.ticket,
      pickupOn: payload.pickupOn,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: DRY_CLEAN_PICKUP_EVENT,
        dedupeKey: dryCleanPickupJobId(payload.wardrobeItemId, payload.pickupOn),
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
