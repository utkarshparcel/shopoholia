import type { BackupWhyInput } from "../closet-notes.js";
import { eventPhrase, notableTemp } from "../closet-notes.js";
import type { ItemSlot, LegCoverage } from "../schemas/closet-item.js";
import type { BackupCheck, NoteReason } from "../schemas/closet-week.js";
import type { Day } from "./day.js";
import type { Extras, Look, Rule, Worn } from "./looks.js";
import { NO_EXTRAS } from "./looks.js";
import type { Piece } from "./pieces.js";
import {
  bagName, CORE_SLOTS, describe, fabric, isPlural, legPiece, LONG_LEGS, mean, pieceName, UPPER_SLOTS,
} from "./pieces.js";
import { reason } from "./reasons.js";

/**
 * The four backup checks (§8.5). Each reads the planned look for what trips it, says what a fix
 * must be, and writes the fix's note. They read only the body fields that count (§8.1), so an
 * unknown field never trips a check and never counts as a fix.
 */

export type Zone = "shoulders" | "underarms" | "legs";
export const ZONES: readonly Zone[] = ["shoulders", "underarms", "legs"];

/** The slots whose coverage decides a zone: a saree's blouse decides the underarms, its drape the legs. */
const LEG_SLOTS: ReadonlySet<ItemSlot> = new Set(["BOTTOM", "COORD_BOTTOM", "ACTIVE_BOTTOM", "DRESS", "JUMPSUIT", "SAREE"]);
const SHORT_LEGS: ReadonlySet<LegCoverage | undefined> = new Set<LegCoverage | undefined>(["above_knee", "knee"]);

function decides(p: Piece, zone: Zone): boolean {
  return (zone === "legs" ? LEG_SLOTS : UPPER_SLOTS).has(p.slot);
}

function shows(p: Piece, zone: Zone): boolean {
  if (!decides(p, zone)) return false;
  if (zone === "legs") return SHORT_LEGS.has(p.coverage.legs);
  const value = p.coverage[zone];
  return value === "bare" || value === "partly";
}

function covers(p: Piece, zone: Zone): boolean {
  if (!decides(p, zone)) return true;
  return zone === "legs" ? LONG_LEGS.has(p.coverage.legs) : p.coverage[zone] === "covered";
}

export function shownZones(core: readonly Piece[]): Zone[] {
  return ZONES.filter((zone) => core.some((p) => shows(p, zone)));
}

/** Backups keep the replaced look's shoes when they still suit the day. */
function keptFootwear(replaced: Worn | null): Piece | null {
  return replaced === null ? null : replaced.footwear;
}

function keptEarrings(replaced: Worn | null): Extras {
  return { evening: false, earrings: replaced === null ? null : replaced.earrings };
}

/** Waist fit counts on everything but a saree blouse, which ends above it. */
const WAIST_SLOTS: ReadonlySet<ItemSlot> = new Set([...CORE_SLOTS].filter((s) => s !== "BLOUSE"));
const HIP_SLOTS: ReadonlySet<ItemSlot> = new Set([
  "BOTTOM", "DRESS", "COORD_BOTTOM", "JUMPSUIT", "SAREE", "KURTA", "ACTIVE_BOTTOM",
]);
const TIGHT: Partial<Record<string, string>> = { bodycon: "tight", fitted: "fitted", ruched: "ruched" };
const EASY: ReadonlySet<string | undefined> = new Set<string | undefined>(["relaxed", "unstructured"]);

/** How the piece sits close, and where: `{ fits: ["ruched", "tight"], areas: ["waist", "hips"] }`. */
function tightness(p: Piece): { fits: string[]; areas: string[] } {
  const fits = new Set<string>();
  const areas = new Set<string>();
  const add = (fit: string | undefined, where: readonly string[]) => {
    if (fit === undefined) return;
    fits.add(fit);
    for (const area of where) areas.add(area);
  };
  if (WAIST_SLOTS.has(p.slot) && p.fit.waist !== undefined) add(TIGHT[p.fit.waist], ["waist"]);
  if (HIP_SLOTS.has(p.slot) && p.fit.hip !== undefined) add(TIGHT[p.fit.hip], ["hips"]);
  if (p.silhouette === "bodycon") add("tight", ["waist", "hips"]);
  return { fits: [...fits], areas: [...areas] };
}

function easy(p: Piece): boolean {
  return (
    (!WAIST_SLOTS.has(p.slot) || EASY.has(p.fit.waist)) &&
    (!HIP_SLOTS.has(p.slot) || EASY.has(p.fit.hip)) &&
    p.silhouette !== "bodycon"
  );
}

function onePiece(core: readonly Piece[]): boolean {
  return core.length === 1;
}

/** The footwear named in a note when it dresses the look up. */
function dressyFootwear(look: Look): NoteReason["params"] {
  return look.footwear.formality >= 3 ? { footwear: look.footwear.subtype } : {};
}

/** One step up from the replaced look, and never past cocktail. */
const EVENING_MAX = 4;

function eveningFloor(replaced: Worn | null): number {
  if (replaced === null || replaced.core.length === 0) return 3;
  return Math.min(Math.round(mean(replaced.core.map((p) => p.formality))) + 1, EVENING_MAX);
}

/** A check's fix is always a test on each base piece. */
export type CheckRule = Rule & { piece: (p: Piece) => boolean };

export interface CheckDef {
  /** What in the planned look trips the check, or null when nothing does. */
  trip(look: Worn, day: Day): BackupWhyInput | null;
  /** What a fix must be, for the trip and the look it replaces. */
  rule(trip: BackupWhyInput | null, replaced: Worn | null): CheckRule;
  extras(replaced: Worn | null): Extras;
  notes(look: Look, replaced: Worn | null): NoteReason[];
}

export const CHECKS: Record<BackupCheck, CheckDef> = {
  NOT_WAXED: {
    trip(look, day) {
      const zones = shownZones(look.core);
      if (zones.length === 0) return null;
      const piece = onePiece(look.core) ? describe(look.core[0]) : "look";
      return { check: "NOT_WAXED", day: day.name, piece, plural: isPlural(piece), zones };
    },
    rule(trip, replaced) {
      const zones = trip?.check === "NOT_WAXED" ? (trip.zones as readonly Zone[]) : ZONES;
      return { piece: (p) => zones.every((zone) => covers(p, zone)), footwear: keptFootwear(replaced) };
    },
    extras: keptEarrings,
    notes(look) {
      const legs = legPiece(look.core);
      const out: NoteReason[] = [];
      if (legs !== null && LONG_LEGS.has(legs.coverage.legs)) {
        const params: NoteReason["params"] = {
          length: legs.coverage.legs as LegCoverage,
          material: legs.material ?? legs.subtype,
        };
        const top = look.core.find((p) => p !== legs && UPPER_SLOTS.has(p.slot));
        if (top !== undefined) params.top = top.subtype;
        else if (look.core.every((p) => covers(p, "underarms"))) params.sleeves = 1;
        out.push(reason("COVERS_LEGS", params));
      } else {
        out.push(reason("COVERS_UPPER", { fabric: fabric(look.core[0]) }));
      }
      out.push(reason("A_CHOICE"));
      return out;
    },
  },
  BLOATED: {
    trip(look) {
      for (const p of look.core) {
        const { fits, areas } = tightness(p);
        if (fits.length > 0) return { check: "BLOATED", piece: pieceName(p), plural: isPlural(p.subtype), fits, areas };
      }
      return null;
    },
    rule(_trip, replaced) {
      return { piece: easy, footwear: keptFootwear(replaced) };
    },
    extras: keptEarrings,
    notes(look) {
      const params = { fabric: fabric(look.core[0]), ...dressyFootwear(look) };
      return [
        reason("NOTHING_AT_WAIST"),
        reason(onePiece(look.core) ? "FALLS_FROM_SHOULDER" : "EASY_AT_WAIST", params),
      ];
    },
  },
  BAD_HAIR: {
    trip(look) {
      return look.core.some((p) => p.hair.styledDown === true) ? { check: "BAD_HAIR" } : null;
    },
    rule(_trip, replaced) {
      return {
        piece: (p) => p.hair.styledDown !== true && (!UPPER_SLOTS.has(p.slot) || p.hair.upFriendly === true),
        footwear: keptFootwear(replaced),
      };
    },
    /** Hair up puts the neckline first, so the earrings aren't carried over. */
    extras: () => NO_EXTRAS,
    notes(look) {
      const out = [reason("HAIR_UP", look.hair === null ? {} : { accessory: look.hair.subtype })];
      if (look.core.every((p) => p.solid)) out.push(reason("PLAIN_CORE", { fabric: fabric(look.core[0]) }));
      return out;
    },
  },
  PARTY_DATE: {
    trip(look, day) {
      if (look.core.every((p) => p.eveningOk === true)) return null;
      const lead = look.core[0];
      const first = day.events[0];
      return {
        check: "PARTY_DATE",
        colour: lead.colour,
        piece: pieceName(lead),
        bag: look.bag === null ? null : bagName(look.bag),
        event: first === undefined ? null : eventPhrase(first),
        tempC: notableTemp(day.high) ? Math.round(day.high) : null,
      };
    },
    rule(_trip, replaced) {
      const floor = eveningFloor(replaced);
      return {
        piece: (p) => p.eveningOk === true && p.formality >= floor && p.formality <= EVENING_MAX,
        footwear: keptFootwear(replaced),
      };
    },
    extras: () => ({ evening: true, earrings: null }),
    notes(look, replaced) {
      const finish: NoteReason["params"] = {
        footwear: look.footwear.subtype,
        same: look.footwear === keptFootwear(replaced) ? 1 : 0,
      };
      if (look.earrings !== null) finish.earrings = pieceName(look.earrings);
      if (look.bag !== null) finish.bag = bagName(look.bag);
      return [reason("AFTER_SIX", { fabric: fabric(look.core[0]) }), reason("EVENING_FINISH", finish)];
    },
  },
};

export const CHECK_ORDER: readonly BackupCheck[] = ["NOT_WAXED", "BLOATED", "BAD_HAIR", "PARTY_DATE"];
