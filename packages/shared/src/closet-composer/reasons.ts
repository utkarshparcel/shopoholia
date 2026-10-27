import { EVENT_COPY, eventMinutes, eventPhrase } from "../closet-notes.js";
import type { NoteReason } from "../schemas/closet-week.js";
import { monthOf } from "./dates.js";
import type { Day } from "./day.js";
import { EVENING_KINDS, LONG_DAY_MINUTES, WORK_KINDS } from "./day.js";
import type { Worn } from "./looks.js";
import { forgotten, MIN_WALKABILITY } from "./looks.js";
import { bareNeck, pieceName, relation } from "./pieces.js";

/** Why a look was chosen, as rule ids and parameters that `closet-notes.ts` turns into words. */

export function reason(rule: string, params: NoteReason["params"] = {}): NoteReason {
  return { rule, params };
}

/** Every day rule the look meets, in the order the week card takes its line from. */
export function dayReasons(look: Worn, day: Day): NoteReason[] {
  const out: NoteReason[] = [];
  const core = look.core;
  const first = day.events[0];
  if (first === undefined) out.push(reason("SLOW_DAY"));
  if (day.kinds.has("WFH") && day.kinds.has("GYM")) out.push(reason("WFH_THEN_GYM"));
  const work = day.events.find((e) => WORK_KINDS.has(e.kind));
  if (work !== undefined) {
    if (day.events.some((e) => EVENING_KINDS.has(e.kind)) && core.every((p) => p.eveningOk === true)) {
      out.push(reason("DESK_TO_DRINKS"));
    }
    const span = eventMinutes(work) ?? 0;
    const shoe = look.footwear;
    if (
      span >= LONG_DAY_MINUTES &&
      core.every((p) => p.formality >= 3) &&
      shoe !== null &&
      (shoe.walkability ?? 0) >= MIN_WALKABILITY
    ) {
      out.push(reason("LONG_DAY", { hours: Math.round(span / 60) }));
    }
  }
  const old = core.filter((p) => forgotten(p, day)).map((p) => p.lastWornMs as number);
  if (old.length > 0) out.push(reason("FORGOTTEN", { month: monthOf(new Date(Math.min(...old)).toISOString()) }));
  if (day.hot) {
    const event = first === undefined ? "day" : EVENT_COPY[first.kind].day;
    const bare = bareNeck(core);
    if (bare) out.push(reason("HOT_BARE", { event }));
    if (look.bag !== null) out.push(reason("HEAT_AND_BAG"));
    if (!bare) out.push(reason("HOT_LIGHT", { event }));
  }
  if (first !== undefined) out.push(reason("FITS_DAY", { event: eventPhrase(first) }));
  return out;
}

/** The stylist's rules: how the two lead colours sit together, why the earrings, hair up. */
export function noteReasons(look: Worn): NoteReason[] {
  const out: NoteReason[] = [];
  const lead = look.core[0];
  const other = look.core.length > 1 ? look.core[1] : look.footwear;
  if (lead.colour !== null && other !== null && other.colour !== null) {
    const rel = relation(lead.tone as string, other.tone as string);
    out.push(
      rel === "TONAL" ? reason("PAIR_TONAL", { a: lead.colour }) : reason(`PAIR_${rel}`, { a: lead.colour, b: other.colour }),
    );
  }
  if (look.earrings !== null) {
    out.push(reason(bareNeck(look.core) ? "EARRINGS_BARE_NECK" : "EARRINGS_FINISH", { earrings: pieceName(look.earrings) }));
  }
  if (look.hair !== null) out.push(reason("HAIR_UP", { accessory: look.hair.subtype }));
  return out;
}
