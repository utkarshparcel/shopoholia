/**
 * Calendar event → outfit occasion (N03-CAL-EVENT-OUTFIT).
 * Maps device calendar titles + start times to wardrobe occasions.
 */

import type { OutfitOccasion } from "./schemas/wardrobe.js";

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

/** Format UTC calendar YYYY-MM-DD for week outfit slots. */
export function plannedForFromEventStart(startAt: string | Date): string {
  const d = asDate(startAt);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Infer outfit occasion from event title; fall back to start-time heuristics.
 * Title keywords win (highest weight); otherwise weekday business hours → WORK,
 * evening → PARTY, else CASUAL.
 */
export function mapEventTitleToOccasion(
  title: string,
  startAt?: string | Date | null,
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
      return occasionFromStartTime(start);
    }
  }
  return { occasion: "CASUAL", reason: "No occasion keywords; default casual" };
}

/**
 * Weekday business hours → WORK; evening → PARTY; else CASUAL.
 * Uses UTC hour/day for deterministic tests (device TZ applied at the edge).
 */
export function occasionFromStartTime(start: Date): { occasion: OutfitOccasion; reason: string } {
  const hour = start.getUTCHours();
  const day = start.getUTCDay(); // 0 Sun … 6 Sat
  const weekday = day >= 1 && day <= 5;

  if (weekday && hour >= 7 && hour < 18) {
    return { occasion: "WORK", reason: "Weekday daytime event → work look" };
  }
  if (hour >= 18 || hour < 5) {
    return { occasion: "PARTY", reason: "Evening event → party look" };
  }
  return { occasion: "CASUAL", reason: "No strong title/time signal → casual" };
}

/** Map a calendar event to a planned outfit occasion + date. */
export function mapCalendarEventToOutfit(event: CalendarEventLike): MappedCalendarOutfit {
  const start = asDate(event.startAt);
  const plannedFor = plannedForFromEventStart(start);
  const mapped = mapEventTitleToOccasion(event.title ?? "", start);
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

export function mapCalendarEventsToOutfits(events: CalendarEventLike[]): MappedCalendarOutfit[] {
  return events.map(mapCalendarEventToOutfit);
}

/**
 * Night-before reminder fire time: previous calendar day at `localHour` UTC
 * (edge layers may adjust for user TZ; helper stays deterministic).
 */
export function nightBeforeReminderAt(
  eventStart: string | Date,
  opts?: { localHour?: number },
): Date {
  const start = asDate(eventStart);
  const hour = opts?.localHour ?? CAL_EVENT_REMINDER_LOCAL_HOUR;
  const remindAt = new Date(start);
  remindAt.setUTCDate(remindAt.getUTCDate() - 1);
  remindAt.setUTCHours(hour, 0, 0, 0);
  return remindAt;
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
}): boolean {
  if (opts.enabled === false) return false;
  const start = asDate(opts.eventStart);
  if (Number.isNaN(start.getTime())) return false;
  const now = opts.now ?? new Date();
  const remindAt = nightBeforeReminderAt(start, { localHour: opts.localHour });
  return remindAt.getTime() > now.getTime();
}

/** Reminder window with delay; null when already past or invalid. */
export function computeNightBeforeReminder(
  eventStart: string | Date,
  opts?: { now?: Date; localHour?: number },
): { remindAt: Date; delayMs: number } | null {
  const start = asDate(eventStart);
  if (Number.isNaN(start.getTime())) return null;
  const now = opts?.now ?? new Date();
  const remindAt = nightBeforeReminderAt(start, { localHour: opts?.localHour });
  const delayMs = remindAt.getTime() - now.getTime();
  if (delayMs <= 0) return null;
  return { remindAt, delayMs };
}
