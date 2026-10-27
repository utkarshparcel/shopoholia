import { dayLabel, eventMinutes, sortEvents } from "../closet-notes.js";
import type { CalendarTag, CalendarTagKind, ClosetDayContext } from "../schemas/closet-context.js";
import type { ClosetOccasion } from "../schemas/closet-week.js";
import { dayMs, weekday, weekdayName } from "./dates.js";

/** What the composer reads off one day's context. Nothing here is guessed beyond the tags and forecast. */
export interface Day {
  /** 0 = Monday. */
  index: number;
  date: string;
  /** Midnight UTC at the start of the day, in ms. */
  start: number;
  /** "Monday". */
  name: string;
  /** In the order the label reads them. */
  events: readonly CalendarTag[];
  kinds: ReadonlySet<CalendarTagKind>;
  high: number | null;
  low: number | null;
  rainy: boolean;
  /** Warm enough for the heat lines. Lower than the label's 30 °C, so a 29 °C walk still counts. */
  hot: boolean;
  /** The day runs into the evening. */
  evening: boolean;
  /** Out of the house, so a bag comes along. */
  out: boolean;
  /** A gym day with nothing but home or a walk around it: active pieces only. */
  active: boolean;
  /** A walk of two hours or more. */
  longWalk: boolean;
  /** A work event of eight hours or more, or a long walk: comfortable shoes first. */
  long: boolean;
  /** The formality the base pieces must sit in, or null when no event sets one. */
  band: readonly [number, number] | null;
  /** The formality footwear and accessories aim for. */
  target: number;
  /** Words a piece's `occasions` can match. */
  keywords: ReadonlySet<string>;
  label: string;
  occasion: ClosetOccasion;
}

export const RAIN_CHANCE = 0.6;
export const HOT_C = 27;
export const LONG_WALK_MINUTES = 120;
export const LONG_DAY_MINUTES = 8 * 60;
const EVENING_MINUTES = 18 * 60;

/** A tag's formality when the phone didn't set one. */
export const KIND_FORMALITY: Record<CalendarTagKind, number | null> = {
  OFFICE: 3, WFH: 2, OFFSITE: 3, MEETING: 3, INTERVIEW: 4,
  BRUNCH: 2, LUNCH: 2, DINNER: 3, DRINKS: 3, DATE: 3, PARTY: 4, WEDDING: 5, FESTIVE: 4,
  GYM: 1, WALK: 1, TRAVEL: 2, OTHER: null,
};

const KEYWORDS: Record<CalendarTagKind, readonly string[]> = {
  OFFICE: ["office", "work", "smart casual"],
  WFH: ["home", "work", "casual", "lounge"],
  OFFSITE: ["office", "work", "offsite", "smart casual"],
  MEETING: ["office", "work", "meeting"],
  INTERVIEW: ["interview", "office", "work", "formal"],
  BRUNCH: ["brunch", "casual", "day out", "weekend"],
  LUNCH: ["lunch", "casual", "day out"],
  DINNER: ["dinner", "date", "evening", "night out"],
  DRINKS: ["drinks", "evening", "night out", "party"],
  DATE: ["date", "dinner", "evening"],
  PARTY: ["party", "night out", "evening"],
  WEDDING: ["wedding", "festive", "ethnic"],
  FESTIVE: ["festive", "festival", "ethnic"],
  GYM: ["gym", "workout", "sport", "active"],
  WALK: ["walk", "outdoor", "casual", "day out"],
  TRAVEL: ["travel", "casual", "comfortable"],
  OTHER: ["casual"],
};
const SLOW_KEYWORDS = ["casual", "home", "lounge", "weekend"];

const OCCASION: Record<CalendarTagKind, ClosetOccasion> = {
  OFFICE: "WORK", WFH: "WORK", OFFSITE: "WORK", MEETING: "WORK", INTERVIEW: "WORK",
  BRUNCH: "CASUAL", LUNCH: "CASUAL", DINNER: "CASUAL", WALK: "CASUAL", OTHER: "CASUAL",
  DRINKS: "PARTY", DATE: "PARTY", PARTY: "PARTY",
  WEDDING: "FESTIVE", FESTIVE: "FESTIVE",
  GYM: "SPORT", TRAVEL: "TRAVEL",
};

export const WORK_KINDS: ReadonlySet<CalendarTagKind> = new Set(["OFFICE", "OFFSITE", "MEETING", "INTERVIEW"]);
export const EVENING_KINDS: ReadonlySet<CalendarTagKind> = new Set(["DINNER", "DRINKS", "PARTY", "DATE"]);
const STAY_KINDS: ReadonlySet<CalendarTagKind> = new Set(["WFH", "GYM"]);
const ACTIVE_KINDS: ReadonlySet<CalendarTagKind> = new Set(["WFH", "GYM", "WALK"]);

function startMinutes(tag: CalendarTag): number | null {
  return tag.startLocal === null ? null : Number(tag.startLocal.slice(0, 2)) * 60 + Number(tag.startLocal.slice(3, 5));
}

function runsLate(tag: CalendarTag): boolean {
  if (EVENING_KINDS.has(tag.kind)) return true;
  const start = startMinutes(tag);
  return !ACTIVE_KINDS.has(tag.kind) && start !== null && start >= EVENING_MINUTES;
}

/**
 * Within one step of every event's formality. When the events are too far apart for one
 * look to sit within a step of all of them, the most formal one wins. On a work day the gym
 * is a change of clothes, so it sets nothing.
 */
function formalityBand(events: readonly CalendarTag[], active: boolean): readonly [number, number] | null {
  const levels: number[] = [];
  for (const tag of events) {
    const level = tag.formality ?? KIND_FORMALITY[tag.kind];
    if (level !== null && (active || tag.kind !== "GYM")) levels.push(level);
  }
  if (levels.length === 0) return null;
  const max = Math.max(...levels);
  const min = Math.min(...levels);
  const hi = max - 1 > min + 1 ? max + 1 : min + 1;
  return [Math.max(1, max - 1), Math.min(5, hi)];
}

export function toDay(context: ClosetDayContext): Day {
  const events = sortEvents(context.events);
  const kinds = new Set(events.map((e) => e.kind));
  const weather = context.weather;
  const high = weather === null ? null : weather.tempMaxC;
  const rainChance = weather === null ? null : weather.rainChance;
  const active = kinds.has("GYM") && [...kinds].every((k) => ACTIVE_KINDS.has(k));
  const band = formalityBand(events, active);
  const keywords = new Set(events.length === 0 ? SLOW_KEYWORDS : events.flatMap((e) => KEYWORDS[e.kind]));
  const first = events[0];
  const longWalk = events.some((e) => e.kind === "WALK" && (eventMinutes(e) ?? 0) >= LONG_WALK_MINUTES);
  return {
    index: weekday(context.date),
    date: context.date,
    start: dayMs(context.date),
    name: weekdayName(context.date),
    events,
    kinds,
    high,
    low: weather === null ? null : weather.tempMinC,
    rainy: rainChance === null ? weather !== null && weather.condition === "rain" : rainChance >= RAIN_CHANCE,
    hot: high !== null && high >= HOT_C,
    evening: events.some(runsLate),
    out: events.some((e) => !STAY_KINDS.has(e.kind)),
    active,
    longWalk,
    long: longWalk || events.some((e) => WORK_KINDS.has(e.kind) && (eventMinutes(e) ?? 0) >= LONG_DAY_MINUTES),
    band,
    target: band === null ? 2 : Math.round((band[0] + band[1]) / 2),
    keywords,
    label: dayLabel(events, high),
    occasion: active ? "SPORT" : first === undefined ? "CASUAL" : OCCASION[first.kind],
  };
}
