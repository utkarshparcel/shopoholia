import { and, eq } from "drizzle-orm";
import {
  deliverGiftOccasionPush,
  giftOccasionDedupeKey,
  jobIdFrom,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import {
  pushEvents,
  recipientProfiles,
  recipients,
  recordPushEventIfNew,
  tailoringOrders,
  users,
  type Db,
} from "@worn/db";
import type { GiftOccasionPayload, TailoringPayload } from "./queues.js";

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
};

async function loadUser(db: Db, userId: string) {
  const [user] = await db
    .select({
      prefs: users.prefs,
      timeZone: users.timeZone,
      pushToken: users.pushToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

/** push_events writes for the push flow: one row per dedupe key, safe to run twice. */
function pushRow(db: Db, userId: string, eventType: string, dedupeKey: string) {
  return {
    insertQueued: async ({ title, body, payload }: { title: string; body: string; payload: Record<string, unknown> }) => {
      const event = await recordPushEventIfNew(db, {
        userId,
        orderId: null,
        eventType,
        dedupeKey,
        title,
        body,
        payload,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id: string, status: "SENT" | "FAILED", expoTicketId?: string | null) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  };
}

export async function processGiftOccasion(
  payload: GiftOccasionPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const [recipient] = await db
    .select({ name: recipients.name })
    .from(recipients)
    .where(and(eq(recipients.id, payload.recipientId), eq(recipients.userId, payload.userId)))
    .limit(1);
  if (!recipient) return { status: "skipped" };
  // The reminder was scheduled for a date the user may since have edited or removed.
  const [profile] = await db
    .select({ importantDates: recipientProfiles.importantDates })
    .from(recipientProfiles)
    .where(eq(recipientProfiles.recipientId, payload.recipientId))
    .limit(1);
  const date = profile?.importantDates.find(
    (d) => d.occasion === payload.occasion && d.date === payload.date,
  );
  if (!date) return { status: "skipped" };
  const user = await loadUser(db, payload.userId);
  if (!user) return { status: "skipped" };
  return deliverGiftOccasionPush({
    userId: payload.userId,
    recipientId: payload.recipientId,
    occasion: payload.occasion,
    date: payload.date,
    label: date.label ?? payload.label,
    recipientName: recipient.name,
    ideaCount: payload.ideaCount,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    now: opts.now,
    sendExpo: opts.sendExpo,
    ...pushRow(
      db,
      payload.userId,
      "gift_occasion",
      giftOccasionDedupeKey(payload.recipientId, payload.occasion, payload.date),
    ),
  });
}

/** Same steps and delays as apps/api/src/lib/tailoring-jobs.ts, which schedules the first one. */
export const TAILORING_LADDER: ReadonlyArray<{ from: string; to: string; delayMs: number }> = [
  { from: "PENDING", to: "CONFIRMED", delayMs: 60 * 60 * 1000 },
  { from: "CONFIRMED", to: "IN_STITCHING", delayMs: 2 * 60 * 60 * 1000 },
  { from: "IN_STITCHING", to: "SHIPPED", delayMs: 24 * 60 * 60 * 1000 },
  { from: "SHIPPED", to: "DELIVERED", delayMs: 48 * 60 * 60 * 1000 },
];

const TAILORING_COPY: Record<string, { title: string; body: string }> = {
  CONFIRMED: { title: "Your tailor confirmed the order", body: "They'll start on it soon." },
  IN_STITCHING: { title: "Your order is being stitched", body: "Your tailor has started stitching it." },
  SHIPPED: { title: "Your tailored piece is on its way", body: "It has left the tailor." },
  DELIVERED: { title: "Your tailored piece has arrived", body: "Try it on and tell us how it fits." },
};

/**
 * The ladder is a timed simulation of a tailor's progress (no tailor partner reports status yet),
 * so it runs only outside production: a real order is never told "shipped" on a timer.
 */
export function tailoringLadderEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export type TailoringHandlerOpts = ClosetPushHandlerOpts & {
  /** Adds the next step's job (the BullMQ worker puts it on the tailoring queue). */
  enqueueNext: (payload: TailoringPayload, options: { delay: number; jobId: string }) => Promise<void>;
};

/**
 * Moves an order one step. Safe to run twice: the move only applies to an order still in the
 * step before, a rerun that finds it already moved repeats only the keyed writes (push dedupe
 * key, next job id), and a job for a step the order has left is dropped.
 */
export async function processTailoringTransition(
  payload: TailoringPayload,
  db: Db,
  opts: TailoringHandlerOpts,
): Promise<ProcessPushResult> {
  if (!tailoringLadderEnabled()) {
    console.info("[worker-gifts] simulated tailoring ladder is off in production", { orderId: payload.orderId });
    return { status: "skipped" };
  }
  const [order] = await db
    .select({ id: tailoringOrders.id, state: tailoringOrders.state })
    .from(tailoringOrders)
    .where(and(eq(tailoringOrders.id, payload.orderId), eq(tailoringOrders.userId, payload.userId)))
    .limit(1);
  if (!order) return { status: "skipped" };
  // Jobs from before toState existed move whatever step the order is on.
  const step = payload.toState
    ? TAILORING_LADDER.find((e) => e.to === payload.toState)
    : TAILORING_LADDER.find((e) => e.from === order.state);
  if (!step) return { status: "skipped" };
  if (order.state === step.from) {
    const moved = await db
      .update(tailoringOrders)
      .set({ state: step.to as typeof order.state, updatedAt: new Date() })
      .where(and(eq(tailoringOrders.id, order.id), eq(tailoringOrders.state, order.state)))
      .returning({ id: tailoringOrders.id });
    // Changed by someone else since the read.
    if (moved.length === 0) return { status: "skipped" };
  } else if (order.state !== step.to) {
    return { status: "skipped" };
  }

  const next = TAILORING_LADDER.find((e) => e.from === step.to);
  if (next) {
    await opts.enqueueNext(
      { orderId: order.id, userId: payload.userId, toState: next.to },
      { delay: next.delayMs, jobId: jobIdFrom(`tailor:${order.id}:${next.to}`) },
    );
  }

  const user = await loadUser(db, payload.userId);
  if (!user) return { status: "skipped" };
  const copy = TAILORING_COPY[step.to]!;
  return runClosetPushDelivery({
    eventType: "tailoring_update",
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: copy.title,
    body: copy.body,
    deepLinkExtra: { orderId: order.id },
    payloadExtra: { orderId: order.id, state: step.to },
    now: opts.now,
    sendExpo: opts.sendExpo,
    ...pushRow(db, payload.userId, "tailoring_update", `tailoring:${order.id}:${step.to}`),
  });
}
