import {
  buildClosetRichPushPayload,
  closetDeepLinkForEvent,
  deliverQueuedPush,
  evaluateNotificationGateFromFlags,
  type ClosetPushDeepLink,
  type ClosetRichPush,
  type ProcessPushResult,
  type sendExpoPush,
} from "./push-delivery.js";

export {
  GIFT_OCCASION_EVENT,
  GIFT_BIRTHDAY_LEAD_DAYS,
  GIFT_FESTIVAL_LEAD_DAYS,
  computeGiftOccasionReminderDelayMs,
  deliverGiftOccasionPush,
  giftOccasionDedupeKey,
  giftOccasionJobId,
  giftOccasionLeadDays,
  giftOccasionPushCopy,
  isFestivalOccasion,
  type GiftOccasionDeliveryDeps,
} from "./gift-occasion-push.js";

/**
 * Shared Closet push flow used by deadline workers (and optionally API):
 * gate (opt-out / frequency cap / quiet hours) → insert QUEUED with deep link
 * → Expo deliver (rich image/amount + Android channel when provided).
 *
 * Gift occasions (WV07-OCCASION-PUSH): prefer `deliverGiftOccasionPush`, which
 * wraps this helper with festival/birthday lead copy and deep links.
 */
export async function runClosetPushDelivery(input: {
  eventType: string;
  consentFlags: Record<string, unknown> | null | undefined;
  pushToken: string | null | undefined;
  title: string;
  body: string;
  deepLinkExtra?: Record<string, string | undefined>;
  /** Extra fields merged into the push_events.payload jsonb (ids, merchant, …). */
  payloadExtra?: Record<string, unknown>;
  /** Rich push: item image URL and/or amount (NOTIF-RICH). */
  rich?: ClosetRichPush;
  /**
   * Count of SENT/QUEUED events in this category inside the frequency-cap
   * window. When omitted, frequency caps are not applied (deadline workers
   * may pass this for re-engagement; PUSH-LIVE-QUIET stays uncapped unless
   * callers opt in).
   */
  recentCategoryCount?: number;
  now?: Date;
  sendExpo?: typeof sendExpoPush;
  insertQueued: (row: {
    title: string;
    body: string;
    payload: ClosetPushDeepLink & Record<string, unknown>;
  }) => Promise<{ id: string }>;
  markStatus: (
    id: string,
    status: "SENT" | "FAILED",
    expoTicketId?: string | null,
  ) => Promise<void>;
}): Promise<ProcessPushResult> {
  const now = input.now ?? new Date();
  const gate = evaluateNotificationGateFromFlags(
    input.consentFlags,
    input.eventType,
    now,
    { recentCategoryCount: input.recentCategoryCount },
  );

  if (gate.action === "skip") {
    return { status: "skipped" };
  }
  if (gate.action === "delay") {
    return { status: "delayed", delayMs: gate.delayMs };
  }

  const link = closetDeepLinkForEvent(input.eventType, input.deepLinkExtra ?? {});
  const richFields = buildClosetRichPushPayload({
    eventType: input.eventType,
    rich: input.rich,
  });
  const payload = {
    ...link,
    ...richFields.dataExtras,
    ...(input.payloadExtra ?? {}),
  };

  const { id } = await input.insertQueued({
    title: input.title,
    body: input.body,
    payload,
  });

  console.info("[push]", input.eventType, link.deepLink, input.title);

  const delivered = await deliverQueuedPush({
    pushToken: input.pushToken,
    title: input.title,
    body: input.body,
    data: payload,
    channelId: richFields.channelId,
    richContent: richFields.richContent,
    mutableContent: richFields.mutableContent,
    sendExpo: input.sendExpo,
  });

  if (delivered.status === "QUEUED") {
    return { status: "queued" };
  }

  await input.markStatus(id, delivered.status, delivered.expoTicketId ?? null);
  return { status: delivered.status === "SENT" ? "sent" : "failed" };
}
