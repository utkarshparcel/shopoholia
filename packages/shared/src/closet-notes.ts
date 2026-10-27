import type { CalendarTag, CalendarTagKind } from "./schemas/closet-context.js";
import type { BackupCheck, ClosetOccasion, NoteReason, RestyleReason } from "./schemas/closet-week.js";

/** The style engine's lines (style spec §8): an outfit's `styleWhy`, gaps, the palette and learned likes. */
export {
  STYLE_REASON_TEMPLATES,
  GAP_WHY_TEMPLATES,
  styleWhy,
  gapWhat,
  paletteLeanLine,
  paletteConfidenceLine,
  learnedLine,
} from "./closet-style/notes.js";

/**
 * Closet copy: day labels, the stylist's notes, and why each backup exists.
 * Every template is plain string assembly over rule ids and parameters, so the
 * same `noteReasons` always render the same words.
 */

const APOS = "’";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export type NoteParams = NoteReason["params"];

export function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "a", "a and b", "a, b and c". */
export function joinList(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function joinOxford(parts: readonly string[]): string {
  if (parts.length < 3) return joinList(parts);
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function str(p: NoteParams, key: string): string {
  return String(p[key] ?? "");
}

/**
 * How each calendar kind reads: as a label's lead ("Lunch at 1"), later in a label or a line
 * ("then drinks", "Right for the office."), and after "a hot" ("a hot lunch", "a hot office day").
 */
export const EVENT_COPY: Record<CalendarTagKind, { noun: string; later: string; day: string }> = {
  OFFICE: { noun: "office", later: "the office", day: "office day" },
  WFH: { noun: "work from home", later: "a day at home", day: "day at home" },
  OFFSITE: { noun: "offsite", later: "the offsite", day: "offsite" },
  MEETING: { noun: "meeting", later: "a meeting", day: "meeting" },
  INTERVIEW: { noun: "interview", later: "an interview", day: "interview" },
  BRUNCH: { noun: "brunch", later: "brunch", day: "brunch" },
  LUNCH: { noun: "lunch", later: "lunch", day: "lunch" },
  DINNER: { noun: "dinner", later: "dinner", day: "dinner" },
  DRINKS: { noun: "drinks", later: "drinks", day: "evening out" },
  DATE: { noun: "date", later: "a date", day: "date" },
  PARTY: { noun: "party", later: "a party", day: "party" },
  WEDDING: { noun: "wedding", later: "a wedding", day: "wedding" },
  FESTIVE: { noun: "festival", later: "the festival", day: "festival" },
  GYM: { noun: "gym", later: "the gym", day: "gym day" },
  WALK: { noun: "walk", later: "a walk", day: "walk" },
  TRAVEL: { noun: "travel", later: "travel", day: "travel day" },
  OTHER: { noun: "plans", later: "your plans", day: "day" },
};

function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** "13:00" → "1", "19:30" → "7:30". */
export function clock(time: string): string {
  const hour = Number(time.slice(0, 2)) % 12 || 12;
  const mins = time.slice(3, 5);
  return mins === "00" ? String(hour) : `${hour}:${mins}`;
}

/** Event length in minutes, or null when either end is unknown. */
export function eventMinutes(tag: CalendarTag): number | null {
  if (tag.startLocal === null || tag.endLocal === null) return null;
  const span = minutes(tag.endLocal) - minutes(tag.startLocal);
  return span < 0 ? span + 24 * 60 : span;
}

function compare(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The fields left to order two events that start together, so input order never matters. */
function rest(t: CalendarTag): string {
  return `${t.endLocal ?? "~"}|${t.formality ?? 0}|${t.outdoor ? 1 : 0}`;
}

/** All-day events first, then by start time; the order labels and the composer share. */
export function sortEvents(events: readonly CalendarTag[]): CalendarTag[] {
  const rank = (t: CalendarTag) => (t.allDay ? 0 : t.startLocal === null ? 2 : 1);
  const start = (t: CalendarTag) => (t.startLocal === null ? 0 : minutes(t.startLocal));
  return [...events].sort(
    (a, b) => rank(a) - rank(b) || start(a) - start(b) || compare(a.kind, b.kind) || compare(rest(a), rest(b)),
  );
}

function isTimed(tag: CalendarTag): tag is CalendarTag & { startLocal: string } {
  return !tag.allDay && tag.startLocal !== null;
}

/** "lunch at 1", or "the office" when the event has no time. */
export function eventPhrase(tag: CalendarTag): string {
  const copy = EVENT_COPY[tag.kind];
  return isTimed(tag) ? `${copy.noun} at ${clock(tag.startLocal)}` : copy.later;
}

function laterPhrase(tag: CalendarTag): string {
  const long = tag.kind === "WALK" && (eventMinutes(tag) ?? 0) >= 120;
  return long ? "a long walk" : EVENT_COPY[tag.kind].later;
}

/** The temperature shows only when it changes what to wear: at 30 °C and above, or 15 °C and below. */
export function notableTemp(tempC: number | null): tempC is number {
  return tempC !== null && (tempC >= 30 || tempC <= 15);
}

/** "Lunch at 1 · 31°", "Offsite, all day", "Work from home · gym at 7", "Office, then drinks", "Slow day". */
export function dayLabel(events: readonly CalendarTag[], tempMaxC: number | null): string {
  const [first, second] = sortEvents(events);
  let text = "Slow day";
  if (first) {
    const lead = cap(EVENT_COPY[first.kind].noun);
    if (second) {
      text = isTimed(first) ? `${lead}, then ${laterPhrase(second)}` : `${lead} · ${eventPhrase(second)}`;
    } else if (first.allDay) {
      text = `${lead}, all day`;
    } else {
      text = isTimed(first) ? `${lead} at ${clock(first.startLocal)}` : lead;
    }
  }
  if (notableTemp(tempMaxC)) text += ` · ${Math.round(tempMaxC)}°`;
  return text;
}

type Template = (p: NoteParams) => string;

/** One line per day on the week card: why this look suits the day. */
export const DAY_LINES: Record<string, Template> = {
  SLOW_DAY: () => "Nothing to think about.",
  WFH_THEN_GYM: () => "Calls on camera, then straight out the door.",
  DESK_TO_DRINKS: () => "Desk to drinks without going home.",
  LONG_DAY: (p) => {
    const hours = Number(p.hours);
    return `Polished in the room, easy for ${NUMBER_WORDS[hours] ?? hours} hours.`;
  },
  FORGOTTEN: (p) => `Out for the first time since ${str(p, "month")}.`,
  HEAT_AND_BAG: () => "Cool for the heat, and a bag for the day.",
  HOT_BARE: (p) => `Light and bare-shouldered for a hot ${str(p, "event")}.`,
  HOT_LIGHT: (p) => `Light enough for a hot ${str(p, "event")}.`,
  FITS_DAY: (p) => `Right for ${str(p, "event")}.`,
  DAY_UNAVAILABLE: (p) => `Nothing in the closet is free for ${str(p, "day")}.`,
};

const LENGTH_WORDS: Record<string, string> = { floor: "Floor-length", ankle: "Ankle-length", trousers: "Full-length" };

function eveningFinish(p: NoteParams): string {
  const parts: string[] = [];
  if (p.earrings) parts.push(str(p, "earrings"));
  if (p.bag) parts.push(`the ${str(p, "bag")}`);
  const same = Number(p.same) === 1;
  if (p.footwear) parts.push(same ? `the same ${str(p, "footwear")}` : `the ${str(p, "footwear")}`);
  if (parts.length === 0) return "";
  return `${cap(joinOxford(parts))}${same ? `, so it${APOS}s dinner, not a gala.` : "."}`;
}

function keepsItDressed(p: NoteParams): string {
  return p.footwear ? `, and the ${str(p, "footwear")} keep it dressed` : "";
}

/** The stylist's note: why the pieces go together. */
export const NOTE_LINES: Record<string, Template> = {
  PAIR_SAME_WARMTH: (p) => `${cap(str(p, "a"))} and ${str(p, "b")}, same warmth.`,
  PAIR_NEUTRAL: (p) => `${cap(str(p, "a"))} and ${str(p, "b")}, an easy pair.`,
  PAIR_TONAL: (p) => `${cap(str(p, "a"))} on ${str(p, "a")}, kept tonal.`,
  PAIR_CONTRAST: (p) => `${cap(str(p, "a"))} against ${str(p, "b")}, one clear contrast.`,
  EARRINGS_BARE_NECK: (p) => `${cap(str(p, "earrings"))} because the neckline${APOS}s bare.`,
  EARRINGS_FINISH: (p) => `${cap(str(p, "earrings"))} to finish it.`,
  HAIR_UP: (p) =>
    p.accessory
      ? `Hair goes up in the ${str(p, "accessory")}, so the neckline does the talking.`
      : "Hair goes up, so the neckline does the talking.",
  PLAIN_CORE: (p) => `${cap(str(p, "fabric"))}, nothing fussy.`,
  NOTHING_AT_WAIST: () => "Nothing at the waist today.",
  FALLS_FROM_SHOULDER: (p) => `${cap(str(p, "fabric"))} falls from the shoulder${keepsItDressed(p)}.`,
  EASY_AT_WAIST: (p) => `${cap(str(p, "fabric"))} sits easy at the waist${keepsItDressed(p)}.`,
  COVERS_LEGS: (p) => {
    const lead = `${LENGTH_WORDS[str(p, "length")] ?? "Full-length"} ${str(p, "material")}`;
    if (p.top) return `${lead} and a crisp ${str(p, "top")}.`;
    return Number(p.sleeves) === 1 ? `${lead} with sleeves.` : `${lead}.`;
  },
  COVERS_UPPER: (p) => `${cap(str(p, "fabric"))} with sleeves.`,
  A_CHOICE: () => "It reads as a choice, not a cover-up.",
  AFTER_SIX: (p) => `${cap(str(p, "fabric"))} after six.`,
  EVENING_FINISH: eveningFinish,
  LIGHTER: (p) => `${cap(str(p, "fabric"))}, lighter for the heat.`,
  WARMER: (p) =>
    p.layer
      ? `${cap(str(p, "fabric"))} with the ${str(p, "layer")} on top, warmer for today.`
      : `${cap(str(p, "fabric"))}, warmer for today.`,
  RAIN_READY: (p) =>
    p.footwear
      ? `${cap(str(p, "fabric"))}, and ${str(p, "footwear")} that can take the rain.`
      : `${cap(str(p, "fabric"))}, ready for the rain.`,
  REPLANNED: (p) => `${cap(str(p, "fabric"))}, re-dressed for ${str(p, "plans")}.`,
};

/** The stylist's note. Falls back to the day line when no note rule applies. */
export function renderNote(reasons: readonly NoteReason[]): string {
  const lines = reasons.flatMap((r) => {
    const template = NOTE_LINES[r.rule];
    return template ? [template(r.params)] : [];
  });
  const note = lines.filter((line) => line !== "").join(" ");
  return note || renderDayLine(reasons);
}

/** The week card's line for the day: the first day rule present, or "" when there is none. */
export function renderDayLine(reasons: readonly NoteReason[]): string {
  for (const r of reasons) {
    const template = DAY_LINES[r.rule];
    if (template) return template(r.params);
  }
  return "";
}

export type BackupWhyInput =
  | { check: "NOT_WAXED"; day: string; piece: string; plural: boolean; zones: readonly string[] }
  | { check: "BLOATED"; piece: string; plural: boolean; fits: readonly string[]; areas: readonly string[] }
  | { check: "BAD_HAIR" }
  | {
      check: "PARTY_DATE";
      colour: string | null;
      piece: string;
      bag: string | null;
      event: string | null;
      tempC: number | null;
    };

/** Why a backup exists, read off the planned look that triggered its check. */
export function backupWhy(input: BackupWhyInput): string {
  switch (input.check) {
    case "NOT_WAXED":
      return `${input.day}${APOS}s ${input.piece} ${input.plural ? "show" : "shows"} ${joinList(input.zones)}.`;
    case "BLOATED":
      return `The ${input.piece} ${input.plural ? "are" : "is"} ${joinList(input.fits)} through the ${joinList(input.areas)}.`;
    case "BAD_HAIR":
      return "The look was built around hair down and blow-dried.";
    case "PARTY_DATE": {
      const lead =
        input.bag && input.colour ? `${cap(input.colour)} and ${article(input.bag)} ${input.bag}` : cap(input.piece);
      const tail = input.event ? `planned for ${input.event}` : "planned for the day";
      const temp = input.tempC === null ? "" : ` in ${input.tempC}°`;
      return `${lead}, ${tail}${temp}.`;
    }
  }
}

/** Why a backup exists when nothing in the plan trips its check. */
export const BACKUP_WHY_NONE: Record<BackupCheck, string> = {
  NOT_WAXED: "Nothing in the plan shows underarms or legs.",
  BLOATED: "Nothing in the plan sits tight at the waist.",
  BAD_HAIR: "Nothing in the plan needs hair down.",
  PARTY_DATE: "Every look in the plan already works for the evening.",
};

/** What the closet lacks when a check has no answer. */
export function backupMissing(check: BackupCheck, zones: readonly string[], when: "this week" | "today"): string {
  switch (check) {
    case "NOT_WAXED":
      return `Nothing that covers the ${joinList(zones.length ? zones : ["underarms", "legs"])} fits ${when}.`;
    case "BLOATED":
      return `Nothing loose through the waist and hips fits ${when}.`;
    case "BAD_HAIR":
      return `Nothing built for hair up fits ${when}.`;
    case "PARTY_DATE":
      return `Nothing evening-ready fits ${when}.`;
  }
}

/** The four checks as the site names them. */
export const CHECK_COPY: Record<BackupCheck, { title: string; checks: string }> = {
  NOT_WAXED: { title: "Not waxed", checks: "Checks what the plan shows" },
  BLOATED: { title: "Bloated", checks: "Checks where it sits close" },
  BAD_HAIR: { title: "Bad hair day", checks: "Checks what it asks of your hair" },
  PARTY_DATE: { title: "Party or date", checks: `Checks where you${APOS}re headed after` },
};

/** How a changed plan reads in a restyle note. */
export const PLANS_PHRASE: Record<ClosetOccasion, string> = {
  CASUAL: "something casual",
  WORK: "work",
  FORMAL: "something formal",
  PARTY: "a party",
  SPORT: "a workout",
  TRAVEL: "travel",
  FESTIVE: "a festive day",
};

/** Restyle answers when today's look already passes. The other reasons always look for something new. */
export const RESTYLE_PASSES: Record<BackupCheck | "RAIN", string> = {
  NOT_WAXED: `Today${APOS}s look already covers the underarms and legs.`,
  BLOATED: `Today${APOS}s look already sits easy at the waist.`,
  BAD_HAIR: `Today${APOS}s look already works with hair up.`,
  PARTY_DATE: `Today${APOS}s look already works for the evening.`,
  RAIN: `Today${APOS}s look already handles the rain.`,
};

/** Restyle answers when nothing in the closet helps. */
export const RESTYLE_NONE: Record<RestyleReason, string> = {
  NOT_WAXED: "Nothing in the closet fixes this today.",
  BLOATED: "Nothing in the closet fixes this today.",
  BAD_HAIR: "Nothing in the closet fixes this today.",
  PARTY_DATE: "Nothing in the closet fixes this today.",
  TOO_HOT: `Nothing in the closet is lighter than today${APOS}s look.`,
  TOO_COLD: `Nothing in the closet is warmer than today${APOS}s look.`,
  RAIN: "Nothing in the closet is made for rain.",
  PLANS_CHANGED: "Nothing else in the closet suits the new plans.",
};
