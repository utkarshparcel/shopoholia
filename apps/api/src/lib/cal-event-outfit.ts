/**
 * N03 — Calendar event → outfit occasion (API layer).
 * Mapping helpers live in @worn/shared; this module adds planning + reminder enqueue.
 */

import {
  CAL_EVENT_REMINDER_LOCAL_HOUR,
  computeNightBeforeReminder as sharedComputeNightBeforeReminder,
  mapCalendarEventToOutfit,
  plannedForFromEventStart,
  type CalendarEventLike,
  type OutfitOccasion,
} from "@worn/shared";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

export type { CalendarEventLike, OutfitOccasion };
export { CAL_EVENT_REMINDER_LOCAL_HOUR };

export type OccasionMapResult = {
  occasion: OutfitOccasion;
  reason: string;
  plannedFor: string;
};

/** YYYY-MM-DD from event start (UTC date key — matches week calendar slots). */
export function plannedForFromEvent(startAt: Date | string): string {
  return plannedForFromEventStart(startAt);
}

/**
 * Map calendar event title (+ optional time-of-day) to an outfit occasion.
 */
export function mapCalendarEventToOccasion(event: CalendarEventLike): OccasionMapResult {
  const mapped = mapCalendarEventToOutfit(event);
  return {
    occasion: mapped.occasion,
    reason: mapped.reason,
    plannedFor: mapped.plannedFor,
  };
}

export type NightBeforeReminder = {
  remindAt: Date;
  delayMs: number;
};

/**
 * Optional night-before reminder. Returns null when the window has already passed.
 */
export function computeNightBeforeReminder(
  eventStart: Date | string,
  opts?: { now?: Date; hour?: number },
): NightBeforeReminder | null {
  return sharedComputeNightBeforeReminder(eventStart, {
    now: opts?.now,
    localHour: opts?.hour,
  });
}

export type CalEventOutfitPlan = OccasionMapResult & {
  eventId: string | null;
  title: string;
  startAt: string;
  remindAt: string | null;
};

/** Build outfit plan metadata for one calendar event (no wardrobe I/O). */
export function planOutfitFromCalendarEvent(
  event: CalendarEventLike,
  opts?: { now?: Date; remindNightBefore?: boolean; reminderHour?: number },
): CalEventOutfitPlan {
  const mapped = mapCalendarEventToOutfit(event);
  let remindAt: string | null = null;
  if (opts?.remindNightBefore) {
    const rem = computeNightBeforeReminder(event.startAt, {
      now: opts.now,
      hour: opts.reminderHour,
    });
    remindAt = rem?.remindAt.toISOString() ?? null;
  }
  return {
    occasion: mapped.occasion,
    reason: mapped.reason,
    plannedFor: mapped.plannedFor,
    eventId: mapped.eventId,
    title: mapped.title,
    startAt: mapped.startAt,
    remindAt,
  };
}

export const CAL_EVENT_OUTFIT_QUEUE = "cal-event-outfit";
export const CAL_EVENT_OUTFIT_JOB = "cal-event-outfit-reminder";

export function calEventReminderJobId(userId: string, eventKey: string): string {
  return `cal-outfit:${userId}:${eventKey}`;
}

/**
 * Enqueue an optional night-before outfit reminder.
 * Skips when the reminder window has passed (or without Redis outside production); throws
 * QueueUnavailableError when Redis can't take it. Keyed on the start time too, so moving the
 * event schedules a new reminder (the old one is skipped by the handler: its event has moved on).
 */
export async function scheduleCalEventOutfitReminder(input: {
  userId: string;
  eventId?: string | null;
  title: string;
  occasion: OutfitOccasion;
  plannedFor: string;
  startAt: string;
  remindAt: string;
}): Promise<"published" | "skipped"> {
  const delayMs = new Date(input.remindAt).getTime() - Date.now();
  if (!Number.isFinite(delayMs) || delayMs <= 0) return "skipped";
  const eventKey = input.eventId ?? `${input.plannedFor}:${input.title.slice(0, 40)}`;
  const result = await enqueueJob(
    CAL_EVENT_OUTFIT_QUEUE,
    CAL_EVENT_OUTFIT_JOB,
    {
      userId: input.userId,
      eventId: input.eventId ?? null,
      title: input.title,
      occasion: input.occasion,
      plannedFor: input.plannedFor,
      startAt: input.startAt,
    },
    {
      delay: delayMs,
      jobId: jobIdFrom(calEventReminderJobId(input.userId, eventKey), input.startAt),
    },
  );
  return result.status === "queued" ? "published" : "skipped";
}
