import { and, eq } from "drizzle-orm";
import {
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { users, wardrobeItems, type Db } from "@worn/db";
import { pushRow } from "./handler.js";
import {
  DRY_CLEAN_PICKUP_EVENT,
  type DryCleanPickupPayload,
} from "./queues.js";

/**
 * Day-of dry-clean pickup push (N22) — mirrors API `processDryCleanPickup`
 * against Db so BullMQ consumers stay outside the API package graph.
 * Safe to run twice (one push row per item and pickup day); a job for a pickup the user has
 * since collected or moved to another day is dropped.
 */
export async function processDryCleanPickupJob(
  payload: DryCleanPickupPayload,
  db: Db,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
): Promise<ProcessPushResult | { status: "skipped"; reason: string }> {
  const [item] = await db
    .select({
      category: wardrobeItems.category,
      dryCleanTicket: wardrobeItems.dryCleanTicket,
      dryCleanPickupOn: wardrobeItems.dryCleanPickupOn,
      laundryStatus: wardrobeItems.laundryStatus,
    })
    .from(wardrobeItems)
    .where(and(eq(wardrobeItems.id, payload.wardrobeItemId), eq(wardrobeItems.userId, payload.userId)))
    .limit(1);
  if (!item) {
    return { status: "skipped", reason: "not_found" };
  }
  const ticket = item.dryCleanTicket?.trim() ?? "";
  if (!ticket || item.laundryStatus !== "IN_LAUNDRY") {
    return { status: "skipped", reason: "not_at_cleaner" };
  }
  if (item.dryCleanPickupOn !== payload.pickupOn) {
    return { status: "skipped", reason: "rescheduled" };
  }

  const [user] = await db
    .select({ prefs: users.prefs, timeZone: users.timeZone, pushToken: users.pushToken })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user) return { status: "skipped", reason: "user_gone" };

  const label = payload.category ?? item.category;
  return runClosetPushDelivery({
    eventType: DRY_CLEAN_PICKUP_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: "Dry-clean pickup today",
    body: `Ticket ${ticket} · ${label} ready for pickup`,
    deepLinkExtra: { wardrobeItemId: payload.wardrobeItemId },
    payloadExtra: {
      wardrobeItemId: payload.wardrobeItemId,
      ticket,
      pickupOn: payload.pickupOn,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    ...pushRow(db, payload.userId, DRY_CLEAN_PICKUP_EVENT, `dryclean:${payload.wardrobeItemId}:${payload.pickupOn}`),
  });
}
