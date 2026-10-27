/**
 * Day-of dry-clean pickup push (N22-DRYCLEAN-TRACK).
 * Schedules onto the wardrobe Redis queue family; worker-wardrobe can process.
 */
import {
  localDayKey,
  utcMsForLocalWallClock,
  DEFAULT_OUTFIT_TZ,
} from "./wardrobe-jobs.js";
import type { sendExpoPush } from "@worn/shared";

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
  const redisUrl = process.env.WARDROBE_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";

  const timeZone = opts.timeZone ?? payload.timeZone ?? DEFAULT_OUTFIT_TZ;
  const delayMs =
    process.env.NODE_ENV === "test" && !opts.now
      ? 100
      : computeDryCleanPickupDelayMs(payload.pickupOn, {
          now: opts.now,
          timeZone,
        });
  if (delayMs === null) return "skipped";

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(DRY_CLEAN_QUEUE, { connection: redisUrl });
    await queue.add(
      DRY_CLEAN_JOB,
      { ...payload, timeZone },
      {
        delay: delayMs,
        jobId: dryCleanPickupJobId(payload.wardrobeItemId, payload.pickupOn),
      },
    );
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[dry-clean] pickup enqueue failed", String(err));
    return "skipped";
  }
}

export async function processDryCleanPickup(
  payload: DryCleanPickupPayload,
  repos: {
    recordPushEvent: (input: Record<string, unknown>) => Promise<{ id: string }>;
    findUserById?: (id: string) => Promise<{
      consentFlags?: Record<string, unknown>;
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
  const user = (await repos.findUserById?.(payload.userId)) ?? {
    consentFlags: {},
    pushToken: null,
  };
  const label = payload.category ?? item?.category ?? "item";
  return runClosetPushDelivery({
    eventType: DRY_CLEAN_PICKUP_EVENT,
    consentFlags: user.consentFlags,
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
      return { id: event.id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}
