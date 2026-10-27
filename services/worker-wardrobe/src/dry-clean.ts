import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  evaluateNotificationGateFromFlags,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import type { Db } from "@worn/db";
import {
  DRY_CLEAN_PICKUP_EVENT,
  type DryCleanPickupPayload,
} from "./queues.js";

/**
 * Day-of dry-clean pickup push (N22) — mirrors API `processDryCleanPickup`
 * against Db so BullMQ consumers stay outside the API package graph.
 */
export async function processDryCleanPickupJob(
  payload: DryCleanPickupPayload,
  db: Db,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
): Promise<ProcessPushResult | { status: "skipped"; reason: string }> {
  const { wardrobeItems, users, pushEvents } = await import("@worn/db");
  const now = opts.now ?? new Date();

  const [item] = await db
    .select()
    .from(wardrobeItems)
    .where(eq(wardrobeItems.id, payload.wardrobeItemId))
    .limit(1);
  if (!item || item.userId !== payload.userId) {
    return { status: "skipped", reason: "not_found" };
  }
  const ticket = (item as { dryCleanTicket?: string | null }).dryCleanTicket ?? null;
  const laundry = (item as { laundryStatus?: string }).laundryStatus ?? "CLEAN";
  if (!(ticket ?? "").trim() || laundry !== "IN_LAUNDRY") {
    return { status: "skipped", reason: "not_at_cleaner" };
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  const consentFlags = (user?.consentFlags as Record<string, unknown> | undefined) ?? {};
  const gate = evaluateNotificationGateFromFlags(consentFlags, DRY_CLEAN_PICKUP_EVENT, now);
  if (gate.action === "delay") {
    return { status: "delayed", delayMs: gate.delayMs };
  }
  if (gate.action === "skip") {
    return { status: "skipped" };
  }

  const label = payload.category ?? item.category;
  return runClosetPushDelivery({
    eventType: DRY_CLEAN_PICKUP_EVENT,
    consentFlags,
    pushToken: user?.pushToken ?? null,
    title: "Dry-clean pickup today",
    body: `Ticket ${payload.ticket} · ${label} ready for pickup`,
    deepLinkExtra: { wardrobeItemId: payload.wardrobeItemId },
    payloadExtra: {
      wardrobeItemId: payload.wardrobeItemId,
      ticket: payload.ticket,
      pickupOn: payload.pickupOn,
    },
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: DRY_CLEAN_PICKUP_EVENT,
        dedupeKey: `dryclean:${payload.wardrobeItemId}:${payload.pickupOn}`,
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  });
}
