import type { ItemSlot } from "../schemas/closet-item.js";
import type { ClosetOutfit, OutfitSlots } from "../schemas/closet-week.js";
import type { Worn } from "./looks.js";
import { piecesOf } from "./looks.js";
import type { Closet, Piece } from "./pieces.js";
import { CORE_ORDER, SLOT_ORDER } from "./pieces.js";

/** Stored on every outfit, so a change to the rules or weights can be told apart. */
export const COMPOSER_VERSION = "closet-composer/2";

/** The look an outfit row describes, from the pieces still in the closet and in their own slot. */
export function lookOf(outfit: ClosetOutfit, closet: Closet): Worn {
  const get = (slot: ItemSlot): Piece | null => {
    const id = outfit.slots[slot];
    const piece = id === undefined ? undefined : closet.byId.get(id);
    return piece !== undefined && piece.slot === slot ? piece : null;
  };
  const core: Piece[] = [];
  for (const slot of CORE_ORDER) {
    const piece = get(slot);
    if (piece !== null) core.push(piece);
  }
  return {
    core,
    layer: get("LAYER"),
    dupatta: get("DUPATTA"),
    footwear: get("FOOTWEAR"),
    earrings: get("EARRINGS"),
    bag: get("BAG"),
    hair: get("HAIR_ACCESSORY"),
  };
}

export function slotsOf(look: Worn): OutfitSlots {
  const slots: OutfitSlots = {};
  for (const p of piecesOf(look)) slots[p.slot] = p.id;
  return slots;
}

/** The outfit's items in slot order. */
export function itemIdsOf(slots: OutfitSlots): string[] {
  const ids: string[] = [];
  for (const slot of SLOT_ORDER) {
    const id = slots[slot];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

export function roundScore(score: number): number {
  return Math.round(score * 1e4) / 1e4;
}

type OutfitFields = Pick<ClosetOutfit, "id" | "kind" | "occasion" | "plannedFor" | "note" | "noteReasons" | "score"> &
  Partial<Pick<ClosetOutfit, "backupCheck" | "restyleReason" | "forDay" | "fitsDays" | "status" | "styleWhy">>;

export function outfitOf(slots: OutfitSlots, fields: OutfitFields): ClosetOutfit {
  return {
    backupCheck: null,
    restyleReason: null,
    forDay: null,
    fitsDays: [],
    status: "PROPOSED",
    styleWhy: null,
    ...fields,
    slots,
    itemIds: itemIdsOf(slots),
    composerVersion: COMPOSER_VERSION,
  };
}
