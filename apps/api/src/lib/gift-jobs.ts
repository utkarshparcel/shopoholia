import type { sendExpoPush } from "@worn/shared";
import {
  computeGiftOccasionReminderDelayMs,
  deliverGiftOccasionPush,
  giftOccasionDedupeKey,
  giftOccasionJobId,
} from "@worn/shared";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

export const GIFT_OCCASION_QUEUE = "gift-occasion";
export const GIFT_OCCASION_JOB = "gift-occasion-reminder";

export type GiftOccasionPayload = {
  userId: string;
  recipientId: string;
  importantDates: Array<{ occasion: string; date: string; label?: string }>;
};

export type GiftOccasionJobPayload = {
  userId: string;
  recipientId: string;
  occasion: string;
  date: string;
  label?: string;
  recipientName?: string;
  ideaCount?: number;
};

export async function scheduleGiftOccasionReminders(
  payload: GiftOccasionPayload,
  opts: { now?: Date } = {},
): Promise<"published" | "skipped"> {
  const now = opts.now ?? new Date();
  let enqueued = 0;
  // Throws QueueUnavailableError when Redis can't take a job (each id is deterministic, so a
  // retried request re-adds only the ones that are missing).
  for (const d of payload.importantDates) {
    const delayMs = computeGiftOccasionReminderDelayMs(d.date, d.occasion, {
      label: d.label,
      now,
    });
    if (delayMs == null) continue;
    const result = await enqueueJob(
      GIFT_OCCASION_QUEUE,
      GIFT_OCCASION_JOB,
      {
        userId: payload.userId,
        recipientId: payload.recipientId,
        occasion: d.occasion,
        date: d.date,
        ...(d.label ? { label: d.label } : {}),
      } satisfies GiftOccasionJobPayload,
      {
        delay: delayMs,
        jobId: jobIdFrom(giftOccasionJobId(payload.recipientId, d.occasion, d.date)),
      },
    );
    if (result.status === "queued") enqueued += 1;
  }
  return enqueued > 0 ? "published" : "skipped";
}

/** Processor for gift occasion reminders — creates a push event via shared delivery */
export async function processGiftOccasion(
  payload: GiftOccasionJobPayload,
  repos: {
    recordPushEvent: (
      input: Record<string, unknown>,
    ) => Promise<{ id: string; status?: "QUEUED" | "SENT" | "FAILED" }>;
    findUserById?: (id: string) => Promise<{
      prefs?: Record<string, unknown> | null;
      timeZone?: string | null;
      pushToken?: string | null;
    } | null>;
    updatePushEventStatus?: (
      id: string,
      status: "SENT" | "FAILED",
      expoTicketId?: string | null,
    ) => Promise<void>;
  },
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const user = repos.findUserById
    ? await repos.findUserById(payload.userId)
    : { prefs: {}, timeZone: null, pushToken: null };
  if (!user) return { status: "skipped" as const };
  return deliverGiftOccasionPush({
    userId: payload.userId,
    recipientId: payload.recipientId,
    occasion: payload.occasion,
    date: payload.date,
    label: payload.label,
    recipientName: payload.recipientName,
    ideaCount: payload.ideaCount,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
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
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}
