/**
 * WV07-OCCASION-PUSH — festival/birthday lead-time pushes via closet-push-flow.
 * Festival lead = 12d ("12 days to Diwali"); birthday/other = 3d.
 */

import { runClosetPushDelivery } from "./closet-push-flow.js";
import type { ProcessPushResult, sendExpoPush } from "./push-delivery.js";

export const GIFT_OCCASION_EVENT = "gift_occasion";

/** Days before birthday / anniversary / other personal occasions. */
export const GIFT_BIRTHDAY_LEAD_DAYS = 3;
/** Days before festivals (Diwali, Rakhi, …) — north-star “12 days to Diwali”. */
export const GIFT_FESTIVAL_LEAD_DAYS = 12;

const DAY_MS = 86_400_000;

export function isFestivalOccasion(occasion: string, label?: string | null): boolean {
  const hay = `${occasion} ${label ?? ""}`.toLowerCase();
  return /festival|diwali|rakhi|holi|eid|christmas|thanksgiving|navratri|dussehra|onam/.test(
    hay,
  );
}

export function giftOccasionLeadDays(occasion: string, label?: string | null): number {
  return isFestivalOccasion(occasion, label)
    ? GIFT_FESTIVAL_LEAD_DAYS
    : GIFT_BIRTHDAY_LEAD_DAYS;
}

/**
 * Delay until (occasionDate − leadDays). Null when already past the occasion.
 * Inside the lead window → 100ms (fire ASAP).
 */
export function computeGiftOccasionReminderDelayMs(
  occasionDate: Date | string,
  occasion: string,
  opts: { label?: string | null; now?: Date | number; leadDays?: number } = {},
): number | null {
  const occasionMs = new Date(occasionDate).getTime();
  if (Number.isNaN(occasionMs)) return null;
  const nowMs =
    typeof opts.now === "number"
      ? opts.now
      : (opts.now ?? new Date()).getTime();
  if (occasionMs <= nowMs) return null;
  const leadDays =
    opts.leadDays ?? giftOccasionLeadDays(occasion, opts.label ?? null);
  const delayMs = occasionMs - leadDays * DAY_MS - nowMs;
  return delayMs <= 0 ? 100 : delayMs;
}

export function giftOccasionJobId(
  recipientId: string,
  occasion: string,
  date: string,
): string {
  return `gift:${recipientId}:${occasion}:${date}`;
}

export function giftOccasionDedupeKey(
  recipientId: string,
  occasion: string,
  date: string,
): string {
  return `gift-occasion:${recipientId}:${occasion}:${date}`;
}

function prettyOccasion(occasion: string, label?: string | null): string {
  const trimmed = label?.trim();
  if (trimmed) return trimmed;
  const map: Record<string, string> = {
    BIRTHDAY: "Birthday",
    ANNIVERSARY: "Anniversary",
    FESTIVAL: "Festival",
    HOUSEWARMING: "Housewarming",
    GRADUATION: "Graduation",
    OTHER: "Occasion",
  };
  return map[occasion.toUpperCase()] ?? occasion;
}

function utcDaysUntil(dateIso: string, now: Date): number {
  const raw = new Date(dateIso);
  if (Number.isNaN(raw.getTime())) return 0;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  return Math.max(0, Math.round((target - startOfToday) / DAY_MS));
}

/**
 * Copy for occasion push — e.g. “12 days to Diwali — 3 perfect gifts for Mom, all in budget.”
 */
export function giftOccasionPushCopy(input: {
  occasion: string;
  date: string;
  label?: string | null;
  recipientName?: string | null;
  ideaCount?: number;
  now?: Date;
}): { title: string; body: string } {
  const now = input.now ?? new Date();
  const days = utcDaysUntil(input.date, now);
  const label = prettyOccasion(input.occasion, input.label);
  const name = input.recipientName?.trim() || "them";
  const title =
    days <= 0
      ? `${label} is today`
      : days === 1
        ? `1 day to ${label}`
        : `${days} days to ${label}`;
  // A count only when the caller counted real ideas; otherwise no number is claimed.
  const body =
    input.ideaCount != null && input.ideaCount > 0
      ? `${input.ideaCount} perfect gifts for ${name}, all in budget.`
      : `Time to pick a gift for ${name}.`;
  return { title, body };
}

export type GiftOccasionDeliveryDeps = {
  userId: string;
  recipientId: string;
  occasion: string;
  date: string;
  label?: string | null;
  recipientName?: string | null;
  ideaCount?: number;
  /** `user.prefs` (C2) and `user.timeZone` (C1). */
  prefs: Record<string, unknown> | null | undefined;
  timeZone: string | null | undefined;
  pushToken: string | null | undefined;
  now?: Date;
  sendExpo?: typeof sendExpoPush;
  insertQueued: (row: {
    title: string;
    body: string;
    payload: Record<string, unknown>;
  }) => Promise<{ id: string; status?: "QUEUED" | "SENT" | "FAILED" }>;
  markStatus: (
    id: string,
    status: "SENT" | "FAILED",
    expoTicketId?: string | null,
  ) => Promise<void>;
};

/**
 * Deliver gift occasion push through shared closet flow (quiet hours + Expo SENT).
 */
export async function deliverGiftOccasionPush(
  input: GiftOccasionDeliveryDeps,
): Promise<ProcessPushResult> {
  const copy = giftOccasionPushCopy({
    occasion: input.occasion,
    date: input.date,
    label: input.label,
    recipientName: input.recipientName,
    ideaCount: input.ideaCount,
    now: input.now,
  });
  return runClosetPushDelivery({
    eventType: GIFT_OCCASION_EVENT,
    prefs: input.prefs,
    timeZone: input.timeZone,
    pushToken: input.pushToken,
    title: copy.title,
    body: copy.body,
    deepLinkExtra: { recipientId: input.recipientId },
    payloadExtra: {
      recipientId: input.recipientId,
      occasion: input.occasion,
      date: input.date,
      ...(input.label ? { label: input.label } : {}),
      ...(input.recipientName ? { recipientName: input.recipientName } : {}),
    },
    now: input.now,
    sendExpo: input.sendExpo,
    insertQueued: input.insertQueued,
    markStatus: input.markStatus,
  });
}
