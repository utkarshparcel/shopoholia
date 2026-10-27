import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  deliverGiftOccasionPush,
  giftOccasionDedupeKey,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { pushEvents, users, type Db } from "@worn/db";
import type { GiftOccasionPayload, TailoringPayload } from "./queues.js";

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
};

async function loadUser(db: Db, userId: string) {
  const [user] = await db
    .select({
      consentFlags: users.consentFlags,
      pushToken: users.pushToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? { consentFlags: {} as Record<string, unknown>, pushToken: null };
}

export async function processGiftOccasion(
  payload: GiftOccasionPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const user = await loadUser(db, payload.userId);
  return deliverGiftOccasionPush({
    userId: payload.userId,
    recipientId: payload.recipientId,
    occasion: payload.occasion,
    date: payload.date,
    label: payload.label,
    recipientName: payload.recipientName,
    ideaCount: payload.ideaCount ?? 3,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: "gift_occasion",
        dedupeKey: giftOccasionDedupeKey(
          payload.recipientId,
          payload.occasion,
          payload.date,
        ),
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

const TAILORING_LADDER: Array<{ from: string; to: string }> = [
  { from: "PENDING", to: "CONFIRMED" },
  { from: "CONFIRMED", to: "IN_STITCHING" },
  { from: "IN_STITCHING", to: "SHIPPED" },
  { from: "SHIPPED", to: "DELIVERED" },
];

export async function processTailoringTransition(
  payload: TailoringPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult | void> {
  const { tailoringOrders } = await import("@worn/db");
  const { and } = await import("drizzle-orm");
  const [order] = await db
    .select()
    .from(tailoringOrders)
    .where(and(eq(tailoringOrders.id, payload.orderId), eq(tailoringOrders.userId, payload.userId)))
    .limit(1);
  if (!order) return;
  const next = TAILORING_LADDER.find((e) => e.from === order.state);
  if (!next) return;
  await db
    .update(tailoringOrders)
    .set({ state: next.to as never, updatedAt: new Date() })
    .where(eq(tailoringOrders.id, order.id));

  const user = await loadUser(db, payload.userId);
  return runClosetPushDelivery({
    eventType: "tailoring_update",
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    title: `Tailoring ${next.to}`,
    body: `Your tailoring order is now ${next.to}`,
    deepLinkExtra: { orderId: order.id },
    payloadExtra: { orderId: order.id, state: next.to },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: "tailoring_update",
        dedupeKey: `tailoring:${order.id}:${next.to}`,
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
