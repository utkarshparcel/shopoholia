import { renderDayLine, renderNote } from "../closet-notes.js";
import type { ClosetOutfit } from "../schemas/closet-week.js";
import { toDay } from "./day.js";
import type { ComposerResult } from "./input.js";
import { checkCloset, checkDay, parseInput, SwapInputSchema } from "./input.js";
import type { Warning } from "./looks.js";
import { warnings } from "./looks.js";
import { COMPOSER_VERSION, itemIdsOf, lookOf } from "./outfit.js";
import { availableOn, buildCloset, CORE_SLOTS } from "./pieces.js";
import { dayReasons, noteReasons } from "./reasons.js";

export type SwapRejection = "NOT_IN_CLOSET" | "WRONG_SLOT" | "UNAVAILABLE";

export type SwapResult =
  | { status: "APPLIED"; outfit: ClosetOutfit; warnings: Warning[] }
  | { status: "REJECTED"; reason: SwapRejection };

function rejected(reason: SwapRejection): ComposerResult<SwapResult> {
  return { ok: true, value: { status: "REJECTED", reason } };
}

/**
 * Swaps one piece of an outfit for another from the user's closet (`PATCH /outfits/week/:date`).
 * The piece must be in the closet, made for that slot and free that day; a base piece replaces
 * one the outfit already has. Hard constraints it breaks come back as warnings, not a rejection:
 * the user chose it.
 */
export function applySwap(input: unknown): ComposerResult<SwapResult> {
  const parsed = parseInput(SwapInputSchema, input);
  if (!parsed.ok) return parsed;
  const a = parsed.value;
  const error = checkCloset(a.items, a.metrics) ?? checkDay(a.context, a.outfit.plannedFor, "outfit.plannedFor");
  if (error !== null) return { ok: false, error };

  const date = a.context.date;
  const closet = buildCloset(a.items, a.metrics, a.settings, a.seed, date);
  const { slot, itemId } = a.swap;
  const piece = closet.byId.get(itemId);
  if (piece === undefined) return rejected("NOT_IN_CLOSET");
  const fills = CORE_SLOTS.has(slot) ? a.outfit.slots[slot] !== undefined : lookOf(a.outfit, closet).core.length > 0;
  if (piece.slot !== slot || !fills) return rejected("WRONG_SLOT");
  if (!availableOn(piece, date, date)) return rejected("UNAVAILABLE");

  const slots = { ...a.outfit.slots, [slot]: itemId };
  const look = lookOf({ ...a.outfit, slots }, closet);
  const day = toDay(a.context);
  const reasons = [...dayReasons(look, day), ...noteReasons(look)];
  const outfit: ClosetOutfit = {
    ...a.outfit,
    slots,
    itemIds: itemIdsOf(slots),
    note: a.outfit.kind === "DAY" ? renderDayLine(reasons) : renderNote(reasons),
    noteReasons: reasons,
    status: "PROPOSED",
    composerVersion: COMPOSER_VERSION,
    score: null,
    styleWhy: null,
  };
  return { ok: true, value: { status: "APPLIED", outfit, warnings: warnings(look, day) } };
}
