import type { BackupWhyInput } from "../closet-notes.js";
import { backupWhy, PLANS_PHRASE, renderNote, RESTYLE_NONE, RESTYLE_PASSES } from "../closet-notes.js";
import type { CalendarTag, CalendarTagKind, ClosetDayContext } from "../schemas/closet-context.js";
import type {
  Backup, BackupCheck, ClosetOccasion, ClosetOutfit, NoteReason, OutfitSlots, RestyleRequest, RestyleResult,
  RestyleSource,
} from "../schemas/closet-week.js";
import { CHECKS } from "./checks.js";
import type { Day } from "./day.js";
import { toDay } from "./day.js";
import type { ComposerResult } from "./input.js";
import { checkCloset, checkDay, dayKey, failure, inputsHashOf, parseInput, RestyleInputSchema } from "./input.js";
import type { Extras, Look, Rule, Worn } from "./looks.js";
import { accessorize, candidates, EMPTY_LOOK, fits, NO_EXTRAS, poolFor, weightsOf } from "./looks.js";
import { COMPOSER_VERSION, lookOf, outfitOf, roundScore, slotsOf } from "./outfit.js";
import type { Closet, Piece } from "./pieces.js";
import { buildCloset, fabric, mean, pieceName } from "./pieces.js";
import { reason } from "./reasons.js";
import { seededUuid } from "./rng.js";

/** A changed plan as the calendar tag the composer plans the day around. */
const PLAN_TAGS: Record<ClosetOccasion, { kind: CalendarTagKind; formality: number; keywords: readonly string[] }> = {
  CASUAL: { kind: "OTHER", formality: 2, keywords: ["casual", "day out", "weekend"] },
  WORK: { kind: "OFFICE", formality: 3, keywords: ["office", "work", "smart casual"] },
  FORMAL: { kind: "OTHER", formality: 4, keywords: ["formal", "evening", "wedding"] },
  PARTY: { kind: "PARTY", formality: 4, keywords: ["party", "night out", "evening"] },
  SPORT: { kind: "GYM", formality: 1, keywords: ["gym", "workout", "sport", "active"] },
  TRAVEL: { kind: "TRAVEL", formality: 2, keywords: ["travel", "casual", "comfortable"] },
  FESTIVE: { kind: "FESTIVE", formality: 4, keywords: ["festive", "festival", "ethnic"] },
};

/** TOO_HOT dresses for a day this much warmer than the forecast, TOO_COLD this much cooler. */
const SHIFT_C = 4;

/** What a restyle looks for. */
interface Spec {
  day: Day;
  rule: Rule;
  extras: Extras;
  notes: (look: Look) => NoteReason[];
  occasion: ClosetOccasion;
  /** Set for the four checks: this week's backup for it can answer. */
  check?: BackupCheck;
  why?: string;
}

function checkSpec(check: BackupCheck, worn: Worn, day: Day): Spec | string {
  const def = CHECKS[check];
  let trip: BackupWhyInput | null = null;
  if (worn.core.length > 0) {
    trip = def.trip(worn, day);
    if (trip === null) return RESTYLE_PASSES[check];
  }
  return {
    day,
    rule: def.rule(trip, worn),
    extras: def.extras(worn),
    notes: (look) => def.notes(look, worn),
    occasion: day.occasion,
    check,
    why: trip === null ? undefined : backupWhy(trip),
  };
}

function warmthMid(p: Piece): number | null {
  return p.warmMin === null || p.warmMax === null ? null : (p.warmMin + p.warmMax) / 2;
}

/** Pieces made for warmer days (TOO_HOT) or cooler ones (TOO_COLD) than today's look, for a day 4 °C past the forecast. */
function warmthSpec(tooHot: boolean, worn: Worn, day: Day): Spec {
  const sign = tooHot ? 1 : -1;
  const shift = (t: number | null) => (t === null ? null : t + sign * SHIFT_C);
  const mids = worn.core.map(warmthMid).filter((m): m is number => m !== null);
  const base = mids.length === 0 ? null : mean(mids);
  return {
    day: { ...day, high: shift(day.high), low: shift(day.low) },
    rule: {
      piece: (p) => {
        const mid = warmthMid(p);
        return mid !== null && (base === null || sign * (mid - base) > 0);
      },
    },
    extras: NO_EXTRAS,
    notes: (look) => {
      const params: NoteReason["params"] = { fabric: fabric(look.core[0]) };
      if (!tooHot && look.layer !== null) params.layer = pieceName(look.layer);
      return [reason(tooHot ? "LIGHTER" : "WARMER", params)];
    },
    occasion: day.occasion,
  };
}

/** Every base piece and the shoes are made for rain. */
function rainReady(worn: Worn): boolean {
  const shoe = worn.footwear;
  return worn.core.length > 0 && shoe !== null && [...worn.core, shoe].every((p) => p.rainOk === true);
}

function rainSpec(day: Day): Spec {
  return {
    day: { ...day, rainy: true },
    rule: { piece: (p) => p.rainOk === true },
    extras: NO_EXTRAS,
    notes: (look) => [reason("RAIN_READY", { fabric: fabric(look.core[0]), footwear: pieceName(look.footwear) })],
    occasion: day.occasion,
  };
}

/** The new plans replace the day's tags; the look must not be the one already on. */
function plansSpec(occasion: ClosetOccasion, context: ClosetDayContext, worn: Worn): Spec {
  const plan = PLAN_TAGS[occasion];
  const tag: CalendarTag = {
    startLocal: null, endLocal: null, kind: plan.kind, formality: plan.formality, outdoor: false, allDay: true,
  };
  const before = new Set(worn.core.map((p) => p.id));
  return {
    day: { ...toDay({ ...context, events: [tag] }), keywords: new Set(plan.keywords), occasion },
    rule: { look: (core) => core.length !== before.size || core.some((p) => !before.has(p.id)) },
    extras: NO_EXTRAS,
    notes: (look) => [reason("REPLANNED", { fabric: fabric(look.core[0]), plans: PLANS_PHRASE[occasion] })],
    occasion,
  };
}

function specFor(request: RestyleRequest, context: ClosetDayContext, worn: Worn, day: Day): Spec | string {
  switch (request.reason) {
    case "TOO_HOT":
    case "TOO_COLD":
      return warmthSpec(request.reason === "TOO_HOT", worn, day);
    case "RAIN":
      return rainReady(worn) ? RESTYLE_PASSES.RAIN : rainSpec(day);
    case "PLANS_CHANGED":
      return plansSpec(request.occasion as ClosetOccasion, context, worn);
    default:
      return checkSpec(request.reason, worn, day);
  }
}

/** This week's backup for the check, when every piece is still in the closet, free today, and still a fix. */
function usableBackup(backups: readonly Backup[], spec: Spec, closet: Closet): ClosetOutfit | null {
  const date = spec.day.date;
  const backup = backups.find((b) => b.check === spec.check && b.status === "READY" && b.fitsDays.includes(date));
  const outfit = backup?.outfit ?? null;
  if (outfit === null || !outfit.itemIds.every((id) => closet.byId.has(id))) return null;
  const look = lookOf(outfit, closet);
  return fits(look, spec.day, closet.asOf) && look.core.every(spec.rule.piece as (p: Piece) => boolean) ? outfit : null;
}

function answer(
  outfit: ClosetOutfit | null,
  source: RestyleSource,
  note: string,
  why: string | undefined,
): ComposerResult<RestyleResult> {
  return { ok: true, value: why === undefined ? { outfit, source, note } : { outfit, source, note, why } };
}

/**
 * Restyles today for one of the eight reasons. A check is answered from this week's backup when it
 * still fits, and otherwise composed fresh; the other reasons always compose. Nothing renders here.
 */
export function restyle(input: unknown): ComposerResult<RestyleResult> {
  const parsed = parseInput(RestyleInputSchema, input);
  if (!parsed.ok) return parsed;
  const a = parsed.value;
  const { request, context, current } = a;
  const error =
    checkCloset(a.items, a.metrics) ?? checkDay(context, current === null ? null : current.plannedFor, "current.plannedFor");
  if (error !== null) return { ok: false, error };
  if (request.reason === "PLANS_CHANGED" && request.occasion === undefined) {
    return failure("INVALID_INPUT", "request.occasion", "PLANS_CHANGED needs the new occasion");
  }

  const closet = buildCloset(a.items, a.metrics, a.settings, a.seed, context.date);
  const worn = current === null ? EMPTY_LOOK : lookOf(current, closet);
  const spec = specFor(request, context, worn, toDay(context));
  if (typeof spec === "string") return answer(null, "NONE", spec, undefined);

  const inputsHash = inputsHashOf(
    { v: COMPOSER_VERSION, kind: "RESTYLE", request, context: dayKey(context), current, backups: a.backups },
    a,
  );
  const make = (slots: OutfitSlots, note: string, noteReasons: NoteReason[], score: number | null) =>
    outfitOf(slots, {
      id: seededUuid(closet.seed, `${inputsHash}|RESTYLE`),
      kind: "RESTYLE",
      occasion: spec.occasion,
      plannedFor: context.date,
      restyleReason: request.reason,
      note,
      noteReasons,
      score,
    });

  const backup = spec.check === undefined ? null : usableBackup(a.backups, spec, closet);
  if (backup !== null) {
    return answer(make(backup.slots, backup.note, backup.noteReasons, backup.score), "BACKUP", backup.note, spec.why);
  }
  const weights = weightsOf(a.settings);
  const [found] = candidates(poolFor(closet, spec.day, weights), spec.rule, 1).looks;
  if (found === undefined) return answer(null, "NONE", RESTYLE_NONE[request.reason], spec.why);
  const look = accessorize(found, closet, spec.day, weights, spec.extras);
  const noteReasons = spec.notes(look);
  const note = renderNote(noteReasons);
  return answer(make(slotsOf(look), note, noteReasons, roundScore(look.score)), "COMPOSED", note, spec.why);
}
