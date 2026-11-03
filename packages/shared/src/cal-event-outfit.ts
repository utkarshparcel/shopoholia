/**
 * Calendar event → outfit occasion (N03-CAL-EVENT-OUTFIT).
 * Maps device calendar titles + start times to wardrobe occasions.
 */

import { addDaysToKey, localDateKey, localParts, resolveTimeZone, zonedTimeToInstant } from "./local-time.js";
import type { OutfitOccasion } from "./schemas/wardrobe.js";

/**
 * The zone a calendar helper works in: the user's `timeZone` (default zone when invalid), or UTC
 * when the caller passes none (pure, deterministic use).
 */
function zoneOf(timeZone: string | null | undefined): string {
  return timeZone === undefined ? "UTC" : resolveTimeZone(timeZone);
}

export type CalendarEventLike = {
  title?: string | null;
  /** ISO datetime or Date of event start. */
  startAt: string | Date;
  endAt?: string | Date | null;
  id?: string | null;
};

export type MappedCalendarOutfit = {
  eventId: string | null;
  title: string;
  startAt: string;
  plannedFor: string;
  occasion: OutfitOccasion;
  reason: string;
};

/** Default local hour (0–23) for optional night-before reminder. */
export const CAL_EVENT_REMINDER_LOCAL_HOUR = 20;

type KeywordRule = {
  occasion: OutfitOccasion;
  pattern: RegExp;
  label: string;
  weight: number;
};

const KEYWORD_RULES: KeywordRule[] = [
  { occasion: "FORMAL", pattern: /\b(interview|panel|hiring)\b/i, label: "interview", weight: 12 },
  {
    occasion: "FORMAL",
    pattern: /\b(wedding|shaadi|reception|sangeet|ceremony|nikah)\b/i,
    label: "wedding/ceremony",
    weight: 12,
  },
  {
    occasion: "PARTY",
    pattern: /\b(party|club|birthday|celebration|night\s*out|dinner\s*party)\b/i,
    label: "party",
    weight: 10,
  },
  {
    occasion: "SPORT",
    pattern: /\b(gym|yoga|run|workout|match|tennis|cricket|football|padel|swim)\b/i,
    label: "sport",
    weight: 10,
  },
  {
    occasion: "TRAVEL",
    pattern: /\b(flight|airport|trip|travel|train|check[\s-]?in|boarding)\b/i,
    label: "travel",
    weight: 10,
  },
  {
    occasion: "WORK",
    pattern: /\b(office|standup|stand-up|meeting|work|client|1:1|sprint|all[\s-]?hands)\b/i,
    label: "office/work",
    weight: 8,
  },
  {
    occasion: "CASUAL",
    pattern: /\b(brunch|coffee|casual|errand|hangout)\b/i,
    label: "casual",
    weight: 5,
  },
];

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** The event's local calendar day (YYYY-MM-DD) in `timeZone`, for week outfit slots. */
export function plannedForFromEventStart(startAt: string | Date, timeZone?: string | null): string {
  const tz = zoneOf(timeZone);
  const d = asDate(startAt);
  if (Number.isNaN(d.getTime())) {
    return localDateKey(new Date(), tz);
  }
  return localDateKey(d, tz);
}

/**
 * Infer outfit occasion from event title; fall back to start-time heuristics.
 * Title keywords win (highest weight); otherwise weekday business hours → WORK,
 * evening → PARTY, else CASUAL.
 */
export function mapEventTitleToOccasion(
  title: string,
  startAt?: string | Date | null,
  timeZone?: string | null,
): { occasion: OutfitOccasion; reason: string } {
  const trimmed = (title ?? "").trim();
  let best: { occasion: OutfitOccasion; label: string; weight: number } | null = null;
  for (const rule of KEYWORD_RULES) {
    if (!rule.pattern.test(trimmed)) continue;
    if (!best || rule.weight > best.weight) {
      best = { occasion: rule.occasion, label: rule.label, weight: rule.weight };
    }
  }
  if (best) {
    return {
      occasion: best.occasion,
      reason: `Matched “${best.label}” in event title`,
    };
  }
  if (startAt != null) {
    const start = asDate(startAt);
    if (!Number.isNaN(start.getTime())) {
      return occasionFromStartTime(start, timeZone);
    }
  }
  return { occasion: "CASUAL", reason: "No occasion keywords; default casual" };
}

/**
 * Weekday business hours → WORK; evening → PARTY; else CASUAL. Hour and weekday are local to
 * `timeZone` (UTC when none is passed).
 */
export function occasionFromStartTime(
  start: Date,
  timeZone?: string | null,
): { occasion: OutfitOccasion; reason: string } {
  const local = localParts(start, zoneOf(timeZone));
  const hour = local.hour;
  const weekday = local.weekday >= 1 && local.weekday <= 5; // ISO: 1 Mon … 7 Sun

  if (weekday && hour >= 7 && hour < 18) {
    return { occasion: "WORK", reason: "Weekday daytime event → work look" };
  }
  if (hour >= 18 || hour < 5) {
    return { occasion: "PARTY", reason: "Evening event → party look" };
  }
  return { occasion: "CASUAL", reason: "No strong title/time signal → casual" };
}

/** Map a calendar event to a planned outfit occasion + date. */
export function mapCalendarEventToOutfit(
  event: CalendarEventLike,
  timeZone?: string | null,
): MappedCalendarOutfit {
  const start = asDate(event.startAt);
  const plannedFor = plannedForFromEventStart(start, timeZone);
  const mapped = mapEventTitleToOccasion(event.title ?? "", start, timeZone);
  const startIso = Number.isNaN(start.getTime()) ? new Date().toISOString() : start.toISOString();
  return {
    eventId: event.id ?? null,
    title: (event.title ?? "").trim() || "Untitled event",
    startAt: startIso,
    plannedFor,
    occasion: mapped.occasion,
    reason: mapped.reason,
  };
}

export function mapCalendarEventsToOutfits(
  events: CalendarEventLike[],
  timeZone?: string | null,
): MappedCalendarOutfit[] {
  return events.map((event) => mapCalendarEventToOutfit(event, timeZone));
}

/**
 * Night-before reminder fire time: `localHour` (20:00) on the local day before the event, in
 * `timeZone` (UTC when none is passed). 20:00 local sits before the default 22:00 quiet hours.
 */
export function nightBeforeReminderAt(
  eventStart: string | Date,
  opts?: { localHour?: number; timeZone?: string | null },
): Date {
  const tz = zoneOf(opts?.timeZone);
  const start = asDate(eventStart);
  const hour = opts?.localHour ?? CAL_EVENT_REMINDER_LOCAL_HOUR;
  const dayBefore = addDaysToKey(localDateKey(start, tz), -1);
  return zonedTimeToInstant(dayBefore, `${String(hour).padStart(2, "0")}:00`, tz);
}

/**
 * Whether to schedule the optional night-before outfit reminder.
 * Disabled when `enabled` is false, or when the remind-at is already past.
 */
export function shouldScheduleNightBeforeReminder(opts: {
  eventStart: string | Date;
  enabled?: boolean;
  now?: Date;
  localHour?: number;
  timeZone?: string | null;
}): boolean {
  if (opts.enabled === false) return false;
  const start = asDate(opts.eventStart);
  if (Number.isNaN(start.getTime())) return false;
  const now = opts.now ?? new Date();
  const remindAt = nightBeforeReminderAt(start, { localHour: opts.localHour, timeZone: opts.timeZone });
  return remindAt.getTime() > now.getTime();
}

/** Reminder window with delay; null when already past or invalid. */
export function computeNightBeforeReminder(
  eventStart: string | Date,
  opts?: { now?: Date; localHour?: number; timeZone?: string | null },
): { remindAt: Date; delayMs: number } | null {
  const start = asDate(eventStart);
  if (Number.isNaN(start.getTime())) return null;
  const now = opts?.now ?? new Date();
  const remindAt = nightBeforeReminderAt(start, { localHour: opts?.localHour, timeZone: opts?.timeZone });
  const delayMs = remindAt.getTime() - now.getTime();
  if (delayMs <= 0) return null;
  return { remindAt, delayMs };
}
