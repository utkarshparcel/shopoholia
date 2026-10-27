import type { sendExpoPush } from "@worn/shared";
import {
  computeGiftOccasionReminderDelayMs,
  deliverGiftOccasionPush,
  giftOccasionDedupeKey,
  giftOccasionJobId,
} from "@worn/shared";

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
  const redisUrl = process.env.GIFT_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";
  const now = opts.now ?? new Date();
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(GIFT_OCCASION_QUEUE, { connection: redisUrl });
    let enqueued = 0;
    for (const d of payload.importantDates) {
      const delayMs = computeGiftOccasionReminderDelayMs(d.date, d.occasion, {
        label: d.label,
        now,
      });
      if (delayMs == null) continue;
      await queue.add(
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
          jobId: giftOccasionJobId(payload.recipientId, d.occasion, d.date),
        },
      );
      enqueued += 1;
    }
    await queue.close();
    return enqueued > 0 ? "published" : "skipped";
  } catch (err) {
    console.warn("[gift] occasion reminder enqueue failed", String(err));
    return "skipped";
  }
}

/** Processor for gift occasion reminders — creates a push event via shared delivery */
export async function processGiftOccasion(
  payload: GiftOccasionJobPayload,
  repos: {
    recordPushEvent: (input: Record<string, unknown>) => Promise<{ id: string }>;
    findUserById?: (id: string) => Promise<{
      consentFlags?: Record<string, unknown>;
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
  const user = (await repos.findUserById?.(payload.userId)) ?? {
    consentFlags: {},
    pushToken: null,
  };
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
      return { id: event.id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}
