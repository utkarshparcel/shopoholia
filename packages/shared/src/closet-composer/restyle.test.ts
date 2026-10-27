import { describe, expect, it } from "vitest";
import { BACKUP_WHY_NONE, RESTYLE_NONE, RESTYLE_PASSES } from "../closet-notes.js";
import type { ClosetDayContext } from "../schemas/closet-context.js";
import type { ItemAttributes, ItemSlot } from "../schemas/closet-item.js";
import type { Backup, BackupCheck, ClosetOutfit, OutfitSlots, RestyleReason, RestyleResult } from "../schemas/closet-week.js";
import { ClosetOutfitSchema, RestyleResultSchema } from "../schemas/closet-week.js";
import type { ComposerError, ComposerItemInput, ComposerResult, RestyleInput, SwapInput, SwapResult } from "./index.js";
import { applySwap, COMPOSER_VERSION, restyle } from "./index.js";

const MON = "2026-11-09";
const TUE = "2026-11-10";
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ATTRS: ItemAttributes = {
  v: 1,
  slot: "OTHER",
  subtype: "",
  colours: [{ name: "black", hex: "#111111", share: 1 }],
  pattern: "solid",
  materials: [],
  warmth: { minC: 0, maxC: 40 },
  rainOk: false,
  formality: 2,
  occasions: [],
  feel: [],
  coverage: {},
  fit: {},
  hair: {},
  eveningOk: false,
  confidence: {},
};

const colour = (name: string) => [{ name, hex: "#000000", share: 1 }];

function item(n: number, slot: ItemSlot, attrs: Partial<ItemAttributes> = {}, more: Partial<ComposerItemInput> = {}): ComposerItemInput {
  return {
    id: id(n),
    category: slot.toLowerCase(),
    colors: [],
    costMinor: 0,
    laundryStatus: "CLEAN",
    attributesSource: "USER",
    attributes: { ...ATTRS, slot, subtype: slot.toLowerCase(), ...attrs },
    ...more,
  };
}

/** Strapless, short, tight at the waist, styled for hair down, and not for the evening. */
const MINI = item(1, "DRESS", {
  colours: colour("sage"),
  subtype: "mini",
  neckline: "strapless",
  coverage: { shoulders: "bare", underarms: "bare", legs: "above_knee" },
  fit: { waist: "bodycon" },
  hair: { styledDown: true },
  warmth: { minC: 18, maxC: 30 },
});
/** Covered, easy at the waist, built for hair up, and good for the evening: the fix for all four checks. */
const MAXI = item(2, "DRESS", {
  colours: colour("navy"),
  subtype: "maxi",
  materials: ["linen"],
  coverage: { shoulders: "covered", underarms: "covered", legs: "floor" },
  fit: { waist: "relaxed", hip: "relaxed" },
  hair: { upFriendly: true, styledDown: false },
  eveningOk: true,
  formality: 3,
  warmth: { minC: 10, maxC: 26 },
});
const FLATS = item(20, "FOOTWEAR", { colours: colour("tan"), subtype: "flats" });
const HEELS = item(22, "FOOTWEAR", { colours: colour("gold"), subtype: "heels", formality: 4, eveningOk: true });
const CLOSET = [MINI, MAXI, FLATS, HEELS];

const RAIN_DRESS = item(4, "DRESS", {
  colours: colour("olive"),
  subtype: "shirt dress",
  materials: ["cotton"],
  rainOk: true,
  warmth: { minC: 10, maxC: 28 },
});
const BOOTS = item(21, "FOOTWEAR", { colours: colour("black"), subtype: "boots", rainOk: true });

function ctx(weather: Partial<NonNullable<ClosetDayContext["weather"]>> | null = {}): ClosetDayContext {
  return {
    date: MON,
    weather:
      weather === null
        ? null
        : { date: MON, tempMinC: 18, tempMaxC: 24, rainChance: 0.1, condition: "sunny", provider: "test", ...weather },
    events: [],
  };
}

function outfit(slots: OutfitSlots, more: Partial<ClosetOutfit> = {}): ClosetOutfit {
  return {
    id: id(900),
    kind: "DAY",
    slots,
    itemIds: Object.values(slots),
    occasion: "CASUAL",
    plannedFor: MON,
    backupCheck: null,
    restyleReason: null,
    forDay: null,
    fitsDays: [],
    note: "",
    noteReasons: [],
    status: "PROPOSED",
    composerVersion: COMPOSER_VERSION,
    score: 1,
    ...more,
  };
}

const worn = (dress: ComposerItemInput, shoes: ComposerItemInput | null = FLATS): OutfitSlots =>
  shoes === null ? { DRESS: dress.id } : { DRESS: dress.id, FOOTWEAR: shoes.id };

function backup(check: BackupCheck, slots: OutfitSlots | null, more: Partial<Backup> = {}): Backup {
  return {
    check,
    status: "READY",
    forDay: MON,
    fitsDays: [MON],
    outfit:
      slots === null
        ? null
        : outfit(slots, {
            id: id(901),
            kind: "BACKUP",
            plannedFor: null,
            backupCheck: check,
            forDay: MON,
            fitsDays: [MON],
            note: "Kept from the week.",
            noteReasons: [{ rule: "A_CHOICE", params: {} }],
            score: 0.5,
          }),
    why: BACKUP_WHY_NONE[check],
    missing: null,
    ...more,
  };
}

function input(reason: RestyleReason, current: OutfitSlots | null, more: Partial<RestyleInput> = {}): RestyleInput {
  return {
    request: { reason },
    context: ctx(),
    current: current === null ? null : outfit(current),
    items: CLOSET,
    seed: 7,
    ...more,
  };
}

function ok<T>(result: ComposerResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function err(result: ComposerResult<unknown>): ComposerError {
  if (result.ok) throw new Error("Expected an error");
  return result.error;
}

const where = (e: ComposerError) => [e.code, e.issues[0].path];
const rules = (r: RestyleResult) => r.outfit?.noteReasons.map((n) => n.rule);

/** A composed restyle: a valid RESTYLE row for today, with the note it was given. */
function composed(r: RestyleResult, reason: RestyleReason): ClosetOutfit {
  expect(RestyleResultSchema.parse(r)).toEqual(r);
  expect(r.source).toBe("COMPOSED");
  const o = r.outfit as ClosetOutfit;
  expect(ClosetOutfitSchema.parse(o)).toEqual(o);
  expect(o).toMatchObject({ kind: "RESTYLE", restyleReason: reason, plannedFor: MON, status: "PROPOSED", note: r.note });
  expect(o.itemIds).toEqual(Object.values(o.slots));
  return o;
}

describe("restyle: input", () => {
  it("returns typed errors", () => {
    expect(err(restyle({})).code).toBe("INVALID_INPUT");
    expect(where(err(restyle(input("BLOATED", null, { items: [MINI, MINI] }))))).toEqual(["INVALID_INPUT", "items.1.id"]);
    expect(where(err(restyle(input("BLOATED", null, { context: { ...ctx(), weather: { ...ctx().weather!, date: TUE } } }))))).toEqual([
      "WRONG_DAYS",
      "context.weather.date",
    ]);
    const tomorrow = { ...input("BLOATED", null), current: outfit(worn(MINI), { plannedFor: TUE }) };
    expect(where(err(restyle(tomorrow)))).toEqual(["WRONG_DATE", "current.plannedFor"]);
    expect(where(err(restyle(input("PLANS_CHANGED", worn(MINI)))))).toEqual(["INVALID_INPUT", "request.occasion"]);
  });

  it("is the same answer for the same input", () => {
    const a = ok(restyle(input("NOT_WAXED", worn(MINI))));
    expect(ok(restyle(input("NOT_WAXED", worn(MINI))))).toEqual(a);
    expect(ok(restyle(input("NOT_WAXED", worn(MINI), { seed: 8 }))).outfit?.id).not.toBe(a.outfit?.id);
  });
});

describe("restyle: the four checks", () => {
  it("composes a fix for what today's look trips, and says why", () => {
    const notWaxed = ok(restyle(input("NOT_WAXED", worn(MINI))));
    expect(composed(notWaxed, "NOT_WAXED").slots).toEqual(worn(MAXI));
    expect(notWaxed.why).toBe("Monday’s strapless mini shows shoulders, underarms and legs.");
    expect(notWaxed.note).toBe("Floor-length linen with sleeves. It reads as a choice, not a cover-up.");

    const bloated = ok(restyle(input("BLOATED", worn(MINI))));
    expect(composed(bloated, "BLOATED").slots).toEqual(worn(MAXI));
    expect(bloated.why).toBe("The sage mini is tight through the waist.");
    expect(rules(bloated)).toEqual(["NOTHING_AT_WAIST", "FALLS_FROM_SHOULDER"]);

    const hair = ok(restyle(input("BAD_HAIR", worn(MINI))));
    expect(composed(hair, "BAD_HAIR").slots).toEqual(worn(MAXI));
    expect(hair.why).toBe("The look was built around hair down and blow-dried.");
    expect(hair.note).toBe("Hair goes up, so the neckline does the talking. Navy linen, nothing fussy.");

    const party = ok(restyle(input("PARTY_DATE", worn(MINI))));
    expect(composed(party, "PARTY_DATE").slots).toEqual(worn(MAXI));
    expect(party.why).toBe("Sage mini, planned for the day.");
    expect(rules(party)).toEqual(["AFTER_SIX", "EVENING_FINISH"]);
  });

  it("says so when today's look already passes, and composes nothing", () => {
    for (const check of ["NOT_WAXED", "BLOATED", "BAD_HAIR", "PARTY_DATE"] as const) {
      expect(ok(restyle(input(check, worn(MAXI))))).toEqual({ outfit: null, source: "NONE", note: RESTYLE_PASSES[check] });
    }
  });

  it("with no look today, composes a fix for everything the check looks at", () => {
    const r = ok(restyle(input("NOT_WAXED", null)));
    expect(composed(r, "NOT_WAXED").slots.DRESS).toBe(MAXI.id);
    expect("why" in r).toBe(false);
  });

  it("says nothing in the closet fixes it, and still says why", () => {
    const r = ok(restyle(input("NOT_WAXED", worn(MINI), { items: [MINI, FLATS] })));
    expect(r).toEqual({
      outfit: null,
      source: "NONE",
      note: RESTYLE_NONE.NOT_WAXED,
      why: "Monday’s strapless mini shows shoulders, underarms and legs.",
    });
  });
});

describe("restyle: this week's backup", () => {
  const backups = [backup("NOT_WAXED", worn(MAXI))];

  it("answers from the backup when it still fits today, as a new restyle row", () => {
    const r = ok(restyle(input("NOT_WAXED", worn(MINI), { backups })));
    expect(r.source).toBe("BACKUP");
    expect(r.note).toBe("Kept from the week.");
    expect(r.why).toBe("Monday’s strapless mini shows shoulders, underarms and legs.");
    expect(r.outfit).toMatchObject({
      kind: "RESTYLE",
      restyleReason: "NOT_WAXED",
      backupCheck: null,
      slots: worn(MAXI),
      note: "Kept from the week.",
      noteReasons: [{ rule: "A_CHOICE", params: {} }],
      score: 0.5,
      plannedFor: MON,
    });
    expect(r.outfit?.id).not.toBe(id(901));
    expect(ClosetOutfitSchema.parse(r.outfit)).toEqual(r.outfit);
  });

  it("composes instead when the backup can't stand in today", () => {
    const stale: [string, Backup][] = [
      ["for another day", backup("NOT_WAXED", worn(MAXI), { fitsDays: [TUE] })],
      ["unavailable", backup("NOT_WAXED", null, { status: "UNAVAILABLE", missing: "x" })],
      ["ready with no outfit", backup("NOT_WAXED", null)],
      ["for another check", backup("BLOATED", worn(MAXI))],
      ["a piece gone from the closet", backup("NOT_WAXED", { DRESS: MAXI.id, FOOTWEAR: id(99) })],
      ["not whole", backup("NOT_WAXED", { DRESS: MAXI.id })],
      ["no longer a fix", backup("NOT_WAXED", worn(MINI))],
    ];
    for (const [why, b] of stale) {
      const r = ok(restyle(input("NOT_WAXED", worn(MINI), { backups: [b] })));
      expect(r.source, why).toBe("COMPOSED");
      expect(r.outfit?.slots.DRESS, why).toBe(MAXI.id);
    }
  });

  it("is never used for a reason that isn't a check", () => {
    const r = ok(restyle(input("TOO_COLD", worn(MINI), { backups: [backup("NOT_WAXED", worn(MAXI))] })));
    expect(r.source).toBe("COMPOSED");
  });
});

describe("restyle: weather", () => {
  it("TOO_HOT finds a piece made for warmer days, for a day 4° past the forecast", () => {
    const r = ok(restyle(input("TOO_HOT", worn(MAXI))));
    expect(composed(r, "TOO_HOT").slots.DRESS).toBe(MINI.id);
    expect(r.note).toBe("Sage mini, lighter for the heat.");
    expect("why" in r).toBe(false);
    expect(ok(restyle(input("TOO_HOT", worn(MINI))))).toEqual({ outfit: null, source: "NONE", note: RESTYLE_NONE.TOO_HOT });
  });

  it("TOO_COLD finds a piece made for cooler days, with a layer when the low needs one", () => {
    const r = ok(restyle(input("TOO_COLD", worn(MINI))));
    expect(composed(r, "TOO_COLD").slots.DRESS).toBe(MAXI.id);
    expect(r.note).toBe("Navy linen, warmer for today.");

    const knit = item(3, "DRESS", { colours: colour("cream"), subtype: "midi", materials: ["wool"], warmth: { minC: 16, maxC: 24 } });
    const cardigan = item(30, "LAYER", { colours: colour("camel"), subtype: "cardigan", warmth: { minC: 3, maxC: 20 } });
    const layered = ok(restyle(input("TOO_COLD", worn(MINI), { items: [MINI, knit, cardigan, FLATS] })));
    expect(composed(layered, "TOO_COLD").slots).toMatchObject({ DRESS: knit.id, LAYER: cardigan.id });
    expect(layered.note).toBe("Cream wool with the camel cardigan on top, warmer for today.");
  });

  it("takes any piece with a known warmth when today's has none, and no forecast", () => {
    const untagged = item(9, "DRESS", {}, { attributes: null, slot: "DRESS" });
    const r = ok(restyle(input("TOO_COLD", worn(untagged), { items: [untagged, MAXI, FLATS], context: ctx(null) })));
    expect(composed(r, "TOO_COLD").slots.DRESS).toBe(MAXI.id);
  });

  it("RAIN passes a look made for rain, and otherwise composes one", () => {
    const items = [RAIN_DRESS, BOOTS, MINI, FLATS];
    expect(ok(restyle(input("RAIN", worn(RAIN_DRESS, BOOTS), { items })))).toEqual({
      outfit: null,
      source: "NONE",
      note: RESTYLE_PASSES.RAIN,
    });
    for (const current of [worn(MINI), worn(RAIN_DRESS, null), worn(RAIN_DRESS, FLATS), null]) {
      const r = ok(restyle(input("RAIN", current, { items })));
      expect(composed(r, "RAIN").slots).toEqual(worn(RAIN_DRESS, BOOTS));
      expect(r.note).toBe("Olive cotton, and black boots that can take the rain.");
    }
    expect(ok(restyle(input("RAIN", worn(MINI))))).toEqual({ outfit: null, source: "NONE", note: RESTYLE_NONE.RAIN });
  });
});

describe("restyle: plans changed", () => {
  it("re-dresses the day for the new plans, never as the look already on", () => {
    const r = ok(restyle(input("PLANS_CHANGED", worn(MINI), { request: { reason: "PLANS_CHANGED", occasion: "PARTY" } })));
    const o = composed(r, "PLANS_CHANGED");
    expect(o.occasion).toBe("PARTY");
    expect(o.slots).toEqual({ DRESS: MAXI.id, FOOTWEAR: HEELS.id });
    expect(r.note).toBe("Navy linen, re-dressed for a party.");

    const same = input("PLANS_CHANGED", { DRESS: MAXI.id, FOOTWEAR: HEELS.id }, {
      request: { reason: "PLANS_CHANGED", occasion: "WORK" },
      items: [MAXI, HEELS],
    });
    expect(ok(restyle(same))).toEqual({ outfit: null, source: "NONE", note: RESTYLE_NONE.PLANS_CHANGED });
  });
});

describe("applySwap", () => {
  const EARRINGS = item(40, "EARRINGS", { colours: colour("gold"), subtype: "hoops" });
  const TOP = item(5, "TOP", { colours: colour("white"), subtype: "tee" });
  const DIRTY = item(23, "FOOTWEAR", { subtype: "sneakers" }, { laundryStatus: "DIRTY" });
  const items = [MINI, MAXI, FLATS, BOOTS, EARRINGS, TOP, DIRTY];

  function swap(slots: OutfitSlots, slot: ItemSlot, itemId: string, more: Partial<SwapInput> = {}): ComposerResult<SwapResult> {
    return applySwap({ context: ctx(), outfit: outfit(slots), swap: { slot, itemId }, items, seed: 7, ...more });
  }

  it("swaps in a piece the user owns, for the slot it is made for", () => {
    const r = ok(swap(worn(MINI), "FOOTWEAR", BOOTS.id));
    if (r.status !== "APPLIED") throw new Error(r.status);
    expect(ClosetOutfitSchema.parse(r.outfit)).toEqual(r.outfit);
    expect(r.outfit).toMatchObject({
      slots: worn(MINI, BOOTS),
      itemIds: [MINI.id, BOOTS.id],
      status: "PROPOSED",
      score: null,
      composerVersion: COMPOSER_VERSION,
      note: "Nothing to think about.",
    });
    expect(r.warnings).toEqual([]);
    expect(ok(swap(worn(MINI), "DRESS", MAXI.id))).toMatchObject({ status: "APPLIED", outfit: { slots: worn(MAXI) } });
    expect(ok(swap(worn(MINI), "EARRINGS", EARRINGS.id))).toMatchObject({
      status: "APPLIED",
      outfit: { slots: { ...worn(MINI), EARRINGS: EARRINGS.id } },
    });
  });

  it("writes a backup's note as the stylist's, and warns about what the swap breaks", () => {
    const r = ok(
      applySwap({
        context: ctx({ rainChance: 0.9 }),
        outfit: outfit(worn(MINI, BOOTS), { kind: "BACKUP", plannedFor: null }),
        swap: { slot: "FOOTWEAR", itemId: FLATS.id },
        items,
        seed: 7,
      }),
    );
    expect(r).toMatchObject({ status: "APPLIED", warnings: ["RAIN"], outfit: { note: "Sage and tan, same warmth." } });
  });

  it("rejects a piece that isn't in the closet, isn't for the slot, or isn't free", () => {
    expect(ok(swap(worn(MINI), "FOOTWEAR", id(99)))).toEqual({ status: "REJECTED", reason: "NOT_IN_CLOSET" });
    expect(ok(swap(worn(MINI), "DRESS", FLATS.id))).toEqual({ status: "REJECTED", reason: "WRONG_SLOT" });
    expect(ok(swap(worn(MINI), "TOP", TOP.id))).toEqual({ status: "REJECTED", reason: "WRONG_SLOT" });
    expect(ok(swap({ FOOTWEAR: FLATS.id }, "EARRINGS", EARRINGS.id))).toEqual({ status: "REJECTED", reason: "WRONG_SLOT" });
    expect(ok(swap(worn(MINI), "FOOTWEAR", DIRTY.id))).toEqual({ status: "REJECTED", reason: "UNAVAILABLE" });
  });

  it("returns typed errors", () => {
    expect(err(applySwap({})).code).toBe("INVALID_INPUT");
    expect(where(err(swap(worn(MINI), "FOOTWEAR", BOOTS.id, { items: [MINI, MINI] })))).toEqual(["INVALID_INPUT", "items.1.id"]);
    const tomorrow = { context: ctx(), outfit: outfit(worn(MINI), { plannedFor: TUE }), swap: { slot: "FOOTWEAR", itemId: BOOTS.id }, items, seed: 7 };
    expect(where(err(applySwap(tomorrow)))).toEqual(["WRONG_DATE", "outfit.plannedFor"]);
  });
});
