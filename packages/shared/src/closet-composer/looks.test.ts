import { describe, expect, it } from "vitest";
import type { CalendarTag, ClosetDayContext } from "../schemas/closet-context.js";
import type { ItemAttributes, ItemSlot } from "../schemas/closet-item.js";
import { CHECK_ORDER, CHECKS, shownZones } from "./checks.js";
import { toDay } from "./day.js";
import type { ComposerItemInput, ComposerMetric } from "./input.js";
import { ComposerItemSchema, ComposerSettingsSchema } from "./input.js";
import type { Look, Worn } from "./looks.js";
import {
  accessorize,
  best,
  candidates,
  coreOk,
  EMPTY_LOOK,
  fits,
  footwearOk,
  forgotten,
  layerOk,
  needsLayer,
  NO_EXTRAS,
  occasionFit,
  piecesOf,
  poolFor,
  unary,
  warmthOk,
  warnings,
  weightsOf,
} from "./looks.js";
import { COMPOSER_VERSION, itemIdsOf, lookOf, outfitOf, roundScore, slotsOf } from "./outfit.js";
import type { Closet, Piece } from "./pieces.js";
import { buildCloset } from "./pieces.js";
import { dayReasons, noteReasons } from "./reasons.js";

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
const W = weightsOf(ComposerSettingsSchema.parse({}));
const MON = "2026-11-09";
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const set = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

interface Spec extends Partial<ItemAttributes> {
  colour?: string | null;
  item?: Partial<ComposerItemInput>;
}

function item(n: number, slot: ItemSlot, spec: Spec = {}): ComposerItemInput {
  const { colour = "black", item: more = {}, ...attrs } = spec;
  return {
    id: id(n),
    category: slot.toLowerCase(),
    colors: [],
    costMinor: 0,
    laundryStatus: "CLEAN",
    attributesSource: "USER",
    attributes: {
      ...ATTRS,
      slot,
      subtype: slot.toLowerCase(),
      colours: [{ name: colour ?? "", hex: "#000000", share: 1 }],
      ...attrs,
    },
    ...more,
  };
}

function closetOf(items: ComposerItemInput[], metrics: ComposerMetric[] = [], asOf = MON): Closet {
  return buildCloset(items.map((i) => ComposerItemSchema.parse(i)), metrics, ComposerSettingsSchema.parse({}), "7", asOf);
}

function tag(kind: CalendarTag["kind"], start: string | null = null, end: string | null = null, more: Partial<CalendarTag> = {}): CalendarTag {
  return { startLocal: start, endLocal: end, kind, formality: null, outdoor: false, allDay: false, ...more };
}

function day(events: CalendarTag[] = [], weather: Partial<NonNullable<ClosetDayContext["weather"]>> | null = {}, date = MON) {
  return toDay({
    date,
    weather:
      weather === null
        ? null
        : { date, tempMinC: 18, tempMaxC: 24, rainChance: 0.1, condition: "sunny", provider: "test", ...weather },
    events,
  });
}

function worn(core: Piece[], more: Partial<Worn> = {}): Worn {
  return { ...EMPTY_LOOK, core, ...more };
}

function look(core: Piece[], footwear: Piece, more: Partial<Look> = {}): Look {
  return { ...EMPTY_LOOK, core, footwear, score: 0, ...more };
}

const coreIds = (l: Worn) => l.core.map((p) => p.id);

describe("weights", () => {
  it("uses the defaults, scaled by the user's multipliers", () => {
    expect(W).toEqual({ harmony: 1, forgotten: 0.6, underworn: 0.5, occasion: 0.8, comfort: 0.4, evening: 0.5, variety: 0.3 });
    const scaled = weightsOf(
      ComposerSettingsSchema.parse({ weights: { harmony: 2, forgotten: 0.5, costPerWear: 2, occasion: 1.5, comfort: 2, variety: 0.5 } }),
    );
    expect(scaled).toEqual({ harmony: 2, forgotten: 0.3, underworn: 1, occasion: 1.2000000000000002, comfort: 0.8, evening: 0.5, variety: 0.15 });
    expect(ComposerSettingsSchema.safeParse({ weights: { harmony: 3 } }).success).toBe(false);
  });
});

describe("hard constraints", () => {
  const c = closetOf([
    item(1, "DRESS", { warmth: { minC: 15, maxC: 25 } }),
    item(2, "DRESS", { coverage: { legs: "floor" } }),
    item(3, "DRESS", { coverage: { legs: "floor" }, rainOk: true }),
    item(4, "DRESS", { formality: 4 }),
    item(5, "DRESS", { feel: ["sporty"] }),
    item(6, "FOOTWEAR", { footwear: { heelCm: 1, walkability: 3 } }),
    item(7, "FOOTWEAR", { rainOk: true, footwear: { heelCm: 1, walkability: 4 } }),
    item(8, "FOOTWEAR"),
    item(9, "DRESS", { item: { laundryStatus: "DIRTY" } }),
    item(10, "LAYER", { warmth: { minC: 5, maxC: 15 } }),
    item(11, "DRESS", { item: { attributes: null, slot: "DRESS" } }),
  ]);
  const p = (n: number) => c.byId.get(id(n)) as Piece;

  it("keeps base pieces within 2 °C of their warmth range", () => {
    expect(warmthOk(p(1), null)).toBe(true);
    expect(warmthOk(p(1), 13)).toBe(true);
    expect(warmthOk(p(1), 12)).toBe(false);
    expect(warmthOk(p(1), 27)).toBe(true);
    expect(warmthOk(p(1), 28)).toBe(false);
    expect(warmthOk(p(11), -20)).toBe(true);
  });

  it("adds a layer when the low is under a piece's range", () => {
    expect(needsLayer(p(1), day([], { tempMinC: 14 }))).toBe(true);
    expect(needsLayer(p(1), day([], { tempMinC: 15 }))).toBe(false);
    expect(needsLayer(p(1), day([], null))).toBe(false);
    expect(needsLayer(p(11), day([], { tempMinC: -5 }))).toBe(false);
  });

  it("checks base pieces, layers and shoes against the day", () => {
    const rain = day([], { rainChance: 0.9 });
    const office = day([tag("OFFICE", "09:00", "12:00")]);
    const gym = day([tag("GYM", "07:00", "08:00")]);
    const walk = day([tag("WALK", "10:00", "13:00")]);
    expect(coreOk(p(9), day(), MON)).toBe(false);
    expect(coreOk(p(1), day([], { tempMaxC: 30 }), MON)).toBe(false);
    expect(coreOk(p(2), rain, MON)).toBe(false);
    expect(coreOk(p(3), rain, MON)).toBe(true);
    expect(coreOk(p(1), rain, MON)).toBe(true);
    expect(coreOk(p(4), office, MON)).toBe(true);
    expect(coreOk(p(4), day([tag("BRUNCH")]), MON)).toBe(false);
    expect(coreOk(p(1), gym, MON)).toBe(false);
    expect(coreOk(p(5), gym, MON)).toBe(true);
    expect(layerOk(p(10), day([], { tempMinC: 10 }), MON)).toBe(true);
    expect(layerOk(p(10), day([], { tempMinC: 20 }), MON)).toBe(false);
    expect(footwearOk(p(6), rain, MON)).toBe(false);
    expect(footwearOk(p(7), rain, MON)).toBe(true);
    expect(footwearOk(p(6), walk, MON)).toBe(false);
    expect(footwearOk(p(7), walk, MON)).toBe(true);
    expect(footwearOk(p(8), walk, MON)).toBe(false);
    expect(footwearOk(p(8), day(), MON)).toBe(true);
  });
});

describe("warnings", () => {
  const c = closetOf([
    item(1, "DRESS", { warmth: { minC: 0, maxC: 20 }, coverage: { legs: "floor" }, formality: 4 }),
    item(2, "LAYER", { warmth: { minC: 15, maxC: 25 }, formality: 4 }),
    item(3, "FOOTWEAR", { formality: 4, footwear: { heelCm: 9, walkability: 2 } }),
    item(4, "DRESS", { warmth: { minC: 15, maxC: 30 } }),
    item(5, "FOOTWEAR", { footwear: { heelCm: 1, walkability: 5 } }),
    item(6, "EARRINGS", { item: { laundryStatus: "DIRTY" } }),
  ]);
  const p = (n: number) => c.byId.get(id(n)) as Piece;
  const rough = day([tag("GYM", "07:00", "08:00"), tag("WALK", "13:00", "15:00")], { tempMaxC: 30, tempMinC: 10, rainChance: 0.9 });

  it("names every hard constraint a look breaks, in a fixed order", () => {
    expect(warnings(worn([p(1)], { layer: p(2), footwear: p(3) }), rough)).toEqual(["WARMTH", "RAIN", "FORMALITY", "ACTIVE", "WALK"]);
    expect(warnings(worn([p(4)], { footwear: p(5) }), day([], { tempMinC: 10 }))).toEqual(["WARMTH"]);
    expect(warnings(worn([p(4)]), day())).toEqual([]);
  });

  it("fits a look that is whole, free and breaks nothing", () => {
    expect(fits(worn([p(4)], { footwear: p(5) }), day(), MON)).toBe(true);
    expect(fits(worn([], { footwear: p(5) }), day(), MON)).toBe(false);
    expect(fits(worn([p(4)]), day(), MON)).toBe(false);
    expect(fits(worn([p(4)], { footwear: p(5), earrings: p(6) }), day(), MON)).toBe(false);
    expect(fits(worn([p(4)], { footwear: p(5) }), day([], { tempMaxC: 35 }), MON)).toBe(false);
    expect(piecesOf(worn([p(4)], { footwear: p(5), earrings: p(6), layer: p(2) })).map((x) => x.id)).toEqual([
      id(4), id(2), id(5), id(6),
    ]);
  });
});

describe("soft scores", () => {
  const metrics = [
    { wardrobeItemId: id(1), wearCount: 0, lastWornAt: "2026-09-10T00:00:00Z" },
    { wardrobeItemId: id(2), wearCount: 0, lastWornAt: "2026-09-11T00:00:00Z" },
  ];
  const c = closetOf(
    [
      item(1, "DRESS", { warmth: { minC: 20, maxC: 30 }, occasions: ["lunch"] }),
      item(2, "DRESS", { warmth: { minC: 20, maxC: 30 }, occasions: ["lunch"], eveningOk: true }),
      item(3, "DRESS", { warmth: { minC: 20, maxC: 30 }, occasions: ["lunch"] }),
      item(4, "DRESS", { item: { attributes: null, slot: "DRESS" } }),
    ],
    metrics,
  );
  const p = (n: number) => c.byId.get(id(n)) as Piece;

  it("calls a piece forgotten after 60 days", () => {
    expect(forgotten(p(1), day())).toBe(true);
    expect(forgotten(p(2), day())).toBe(false);
    expect(forgotten(p(3), day())).toBe(false);
  });

  it("scores the day's plans and formality", () => {
    const lunch = day([tag("LUNCH", "13:00", "14:00")], { tempMaxC: 25 });
    expect(occasionFit(p(3), lunch)).toBe(1);
    expect(occasionFit(p(3), day([tag("DINNER", "20:00", "22:00")]))).toBeCloseTo(0.3, 9);
  });

  it("adds under-wear, forgotten, plans, comfort and the evening", () => {
    const lunch = day([tag("LUNCH", "13:00", "14:00")], { tempMaxC: 25 });
    expect(unary(p(3), lunch, W)).toBeCloseTo(0.25 * 1.6 + 0.8 + 0.4, 9);
    expect(unary(p(3), day([tag("LUNCH", "13:00", "14:00")], null), W)).toBeCloseTo(0.4 + 0.8 + 0.2, 9);
    expect(unary(p(1), lunch, W) - unary(p(3), lunch, W)).toBeCloseTo(0.6 - 0.25 * (1.6 - p(1).underworn), 9);
    const dinner = day([tag("DINNER", "20:00", "22:00")]);
    expect(unary(p(2), dinner, W) - unary(p(3), dinner, W)).toBeCloseTo(0.5 + 0.25 * (p(2).underworn - p(3).underworn), 9);
    expect(unary(p(4), lunch, W)).toBeCloseTo(0.25 * p(4).underworn + 0.8 * occasionFit(p(4), lunch) + 0.2, 9);
  });

  it("takes the first best, and null from nothing", () => {
    expect(best([], () => 1)).toBeNull();
    expect(best(["a", "b", "c"], (x) => (x === "a" ? 1 : 2))).toBe("b");
  });
});

describe("candidates", () => {
  const templates = closetOf([
    item(1, "TOP", { colour: "white" }),
    item(2, "BOTTOM", { colour: "blue" }),
    item(3, "DRESS", { colour: "sage" }),
    item(4, "JUMPSUIT"),
    item(5, "ACTIVE_TOP"),
    item(6, "ACTIVE_BOTTOM"),
    item(7, "KURTA", { colour: "red" }),
    item(8, "DUPATTA", { colour: "gold" }),
    item(9, "DUPATTA", { colour: "green" }),
    item(10, "COORD_TOP", { item: { setId: set(1) } }),
    item(11, "COORD_BOTTOM", { item: { setId: set(1) } }),
    item(12, "COORD_TOP"),
    item(13, "COORD_BOTTOM", { item: { setId: set(2) } }),
    item(14, "SAREE", { colour: "maroon", item: { setId: set(3) } }),
    item(15, "BLOUSE", { colour: "maroon", item: { setId: set(3) } }),
    item(16, "SAREE", { colour: "teal" }),
    item(17, "BLOUSE", { colour: "navy" }),
    item(18, "BLOUSE", { colour: "red" }),
    item(19, "FOOTWEAR", { colour: "tan" }),
  ]);

  it("builds every look template, pairing sets and loose sarees by colour", () => {
    const found = candidates(poolFor(templates, day(), W), {}, 300);
    const cores = found.looks.map((l) => [...coreIds(l), l.dupatta?.id ?? "-"].join("+")).sort();
    expect(found.count).toBe(9);
    expect(cores).toEqual(
      [
        [id(3), "-"],
        [id(4), "-"],
        [id(1), id(2), "-"],
        [id(5), id(6), "-"],
        [id(7), id(2), "-"],
        [id(7), id(2), id(8)],
        [id(10), id(11), "-"],
        [id(14), id(15), "-"],
        [id(16), id(17), "-"],
      ]
        .map((x) => x.join("+"))
        .sort(),
    );
    for (const l of found.looks) expect(l.footwear.id).toBe(id(19));
    expect(found.looks.map((l) => l.score)).toEqual([...found.looks.map((l) => l.score)].sort((a, b) => b - a));
  });

  it("returns the single best look, or none", () => {
    const pool = poolFor(templates, day(), W);
    const [top] = candidates(pool, {}, 300).looks;
    expect(candidates(pool, {}, 1)).toEqual({ count: 9, looks: [top] });
    expect(candidates(poolFor(closetOf([item(1, "FOOTWEAR")]), day(), W), {}, 1)).toEqual({ count: 0, looks: [] });
    expect(candidates(poolFor(closetOf([item(1, "DRESS")]), day(), W), {}, 5)).toEqual({ count: 0, looks: [] });
  });

  it("applies a rule's piece test, look test, bias and kept shoes", () => {
    const pool = poolFor(templates, day(), W);
    const onePiece = candidates(pool, { look: (core) => core.length === 1 }, 300);
    expect(onePiece.looks.map((l) => coreIds(l)[0]).sort()).toEqual([id(3), id(4)]);
    const noDress = candidates(pool, { piece: (p) => p.slot !== "DRESS" }, 300);
    expect(noDress.count).toBe(8);
    const [biased] = candidates(pool, { bias: (p) => (p.id === id(16) ? 5 : 0) }, 1).looks;
    expect(coreIds(biased)).toEqual([id(16), id(17)]);
    const shoes = closetOf([item(1, "DRESS"), item(2, "FOOTWEAR", { colour: "black" }), item(3, "FOOTWEAR", { colour: "red" })]);
    const kept = shoes.byId.get(id(3)) as Piece;
    expect(candidates(poolFor(shoes, day(), W), { footwear: kept }, 1).looks[0].footwear).toBe(kept);
    const stranger = closetOf([item(3, "FOOTWEAR", { colour: "red" })]).pieces[0];
    expect(candidates(poolFor(shoes, day(), W), { footwear: stranger }, 1).looks[0].footwear.id).toBe(id(2));
    expect(candidates(poolFor(shoes, day(), W), { footwear: null }, 1).looks[0].footwear.id).toBe(id(2));
  });

  it("adds up to three layers when the low calls for one, and drops the piece when there are none", () => {
    const layered = closetOf([
      item(1, "DRESS", { warmth: { minC: 18, maxC: 30 } }),
      item(2, "FOOTWEAR"),
      ...[3, 4, 5, 6].map((n) => item(n, "LAYER", { warmth: { minC: 0, maxC: 20 } })),
    ]);
    const cold = day([], { tempMinC: 10 });
    const found = candidates(poolFor(layered, cold, W), {}, 300);
    expect(found.count).toBe(3);
    for (const l of found.looks) expect(l.layer?.slot).toBe("LAYER");
    const bare = closetOf([item(1, "DRESS", { warmth: { minC: 18, maxC: 30 } }), item(2, "FOOTWEAR")]);
    expect(candidates(poolFor(bare, cold, W), {}, 300).count).toBe(0);
  });

  it("prefers walkable shoes on a long day, and shares shoe choices across a colour", () => {
    const c = closetOf([
      item(1, "DRESS", { colour: "black" }),
      item(2, "DRESS", { colour: "black" }),
      item(3, "DRESS", { colour: null }),
      item(4, "FOOTWEAR", { colour: "black" }),
      item(5, "FOOTWEAR", { colour: "black", footwear: { heelCm: 1, walkability: 5 } }),
    ]);
    const long = day([tag("OFFICE", "09:00", "18:00")]);
    const found = candidates(poolFor(c, long, W), {}, 300);
    expect(found.count).toBe(3);
    for (const l of found.looks) expect(l.footwear.id).toBe(id(5));
  });
});

describe("accessorize", () => {
  const c = closetOf([
    item(1, "DRESS", { colour: "sage", neckline: "strapless", formality: 2 }),
    item(2, "DRESS", { colour: "black", neckline: "crew", hair: { upFriendly: true } }),
    item(3, "EARRINGS", { colour: "gold", formality: 2 }),
    item(4, "EARRINGS", { colour: "gold", formality: 4, eveningOk: true }),
    item(5, "BAG", { colour: "natural", formality: 2, occasions: ["lunch"] }),
    item(6, "BAG", { colour: "natural", formality: 3, eveningOk: true }),
    item(7, "HAIR_ACCESSORY", { colour: "brown" }),
    item(8, "FOOTWEAR", { colour: "tan" }),
    item(9, "EARRINGS", { colour: "silver", item: { laundryStatus: "DIRTY" } }),
  ]);
  const p = (n: number) => c.byId.get(id(n)) as Piece;
  const lunch = day([tag("LUNCH", "13:00", "14:00")]);

  it("adds earrings for a bare neckline and a bag for a day out", () => {
    const l = accessorize(look([p(1)], p(8)), c, lunch, W, NO_EXTRAS);
    expect([l.earrings?.id, l.bag?.id, l.hair]).toEqual([id(3), id(5), null]);
  });

  it("adds nothing at home but a clip when the look is built for hair up", () => {
    const l = accessorize(look([p(2)], p(8)), c, day(), W, NO_EXTRAS);
    expect([l.earrings, l.bag, l.hair?.id]).toEqual([null, null, id(7)]);
  });

  it("dresses it for the evening, on an evening out or when asked", () => {
    const dinner = accessorize(look([p(2)], p(8)), c, day([tag("DINNER", "20:00", "22:00")]), W, NO_EXTRAS);
    expect([dinner.earrings?.id, dinner.bag?.id]).toEqual([id(4), id(6)]);
    const asked = accessorize(look([p(2)], p(8)), c, day(), W, { evening: true, earrings: null });
    expect([asked.earrings?.id, asked.bag?.id]).toEqual([id(4), id(6)]);
  });

  it("keeps earrings it is given while they are free", () => {
    expect(accessorize(look([p(2)], p(8)), c, day(), W, { evening: false, earrings: p(3) }).earrings).toBe(p(3));
    expect(accessorize(look([p(1)], p(8)), c, lunch, W, { evening: false, earrings: p(9) }).earrings?.id).toBe(id(3));
  });
});

describe("checks", () => {
  const c = closetOf([
    item(1, "DRESS", {
      colour: "sage", subtype: "mini", materials: ["jersey"], neckline: "strapless",
      coverage: { shoulders: "bare", underarms: "bare", legs: "above_knee" },
      silhouette: "bodycon", fit: { waist: "ruched", hip: "bodycon" }, hair: { styledDown: true },
    }),
    item(2, "TOP", { colour: "white", subtype: "tee", coverage: { shoulders: "covered", underarms: "partly" }, fit: { waist: "fitted", hip: "fitted" } }),
    item(3, "BOTTOM", { colour: "blue", subtype: "shorts", coverage: { legs: "above_knee" }, fit: { waist: "defined", hip: "relaxed" } }),
    item(4, "BOTTOM", { colour: "beige", subtype: "trousers", materials: ["linen"], coverage: { legs: "floor" } }),
    item(5, "DRESS", { colour: "black", subtype: "maxi", coverage: { shoulders: "covered", underarms: "covered", legs: "floor" }, hair: { upFriendly: true } }),
    item(6, "DRESS", { colour: "black", subtype: "maxi", coverage: { underarms: "bare", legs: "floor" } }),
    item(7, "DRESS", { colour: "cream", subtype: "midi", materials: ["linen"], coverage: { underarms: "covered", legs: "midi" }, fit: { waist: "relaxed", hip: "relaxed" }, pattern: "floral" }),
    item(8, "FOOTWEAR", { colour: "tan", subtype: "wedges", formality: 3 }),
    item(9, "FOOTWEAR", { colour: "white", subtype: "sneakers" }),
    item(10, "BLOUSE", { fit: { waist: "fitted", hip: "fitted" } }),
    item(11, "BOTTOM", { colour: "black", subtype: "jeans", fit: { waist: "relaxed", hip: "bodycon" } }),
    item(12, "TOP", { fit: { waist: "unstructured" }, hair: { upFriendly: true } }),
    item(13, "EARRINGS", { colour: "gold", subtype: "hoops" }),
    item(14, "BAG", { colour: "natural", subtype: "bag", materials: ["straw"] }),
    item(15, "HAIR_ACCESSORY", { colour: "brown", subtype: "claw clip" }),
    item(16, "DRESS", { colour: "black", subtype: "slip", formality: 4, eveningOk: true }),
    item(17, "DRESS", { formality: 2, eveningOk: true }),
    item(18, "DRESS", { formality: 5, eveningOk: true }),
  ]);
  const p = (n: number) => c.byId.get(id(n)) as Piece;
  const lunch = day([tag("LUNCH", "13:00", "14:30")], { tempMaxC: 31 });
  const sage = worn([p(1)], { footwear: p(8), earrings: p(13), bag: p(14) });

  it("NOT_WAXED trips on what the plan shows", () => {
    expect(CHECKS.NOT_WAXED.trip(sage, lunch)).toEqual({
      check: "NOT_WAXED", day: "Monday", piece: "strapless mini", plural: false, zones: ["shoulders", "underarms", "legs"],
    });
    expect(CHECKS.NOT_WAXED.trip(worn([p(2), p(3)]), lunch)).toMatchObject({ piece: "look", zones: ["underarms", "legs"] });
    expect(CHECKS.NOT_WAXED.trip(worn([p(5)]), lunch)).toBeNull();
    expect(shownZones([p(2)])).toEqual(["underarms"]);
  });

  it("NOT_WAXED's fix covers the zones shown, or all of them, and keeps the shoes and earrings", () => {
    const trip = CHECKS.NOT_WAXED.trip(worn([p(3)]), lunch);
    const legs = CHECKS.NOT_WAXED.rule(trip, sage);
    expect([p(2), p(3), p(4), p(7)].map(legs.piece)).toEqual([true, false, true, false]);
    expect(legs.footwear).toBe(p(8));
    const all = CHECKS.NOT_WAXED.rule(null, null);
    expect([p(5), p(6), p(4)].map(all.piece)).toEqual([true, false, true]);
    expect(all.footwear).toBeNull();
    expect(CHECKS.NOT_WAXED.extras(sage)).toEqual({ evening: false, earrings: p(13) });
    expect(CHECKS.NOT_WAXED.extras(null)).toEqual({ evening: false, earrings: null });
  });

  it("NOT_WAXED's note names the long piece and what goes on top", () => {
    const notes = (core: Piece[]) => CHECKS.NOT_WAXED.notes(look(core, p(8)), sage);
    expect(notes([p(2), p(4)])).toEqual([
      { rule: "COVERS_LEGS", params: { length: "floor", material: "linen", top: "tee" } },
      { rule: "A_CHOICE", params: {} },
    ]);
    expect(notes([p(5)])[0]).toEqual({ rule: "COVERS_LEGS", params: { length: "floor", material: "maxi", sleeves: 1 } });
    expect(notes([p(6)])[0]).toEqual({ rule: "COVERS_LEGS", params: { length: "floor", material: "maxi" } });
    expect(notes([p(7)])[0]).toEqual({ rule: "COVERS_UPPER", params: { fabric: "cream linen" } });
    expect(notes([p(12)])[0]).toEqual({ rule: "COVERS_UPPER", params: { fabric: "black top" } });
  });

  it("BLOATED trips on what sits close, and where", () => {
    expect(CHECKS.BLOATED.trip(sage, lunch)).toEqual({
      check: "BLOATED", piece: "sage mini", plural: false, fits: ["ruched", "tight"], areas: ["waist", "hips"],
    });
    expect(CHECKS.BLOATED.trip(worn([p(2), p(3)]), lunch)).toEqual({
      check: "BLOATED", piece: "white tee", plural: false, fits: ["fitted"], areas: ["waist"],
    });
    expect(CHECKS.BLOATED.trip(worn([p(11)]), lunch)).toMatchObject({ plural: true, fits: ["tight"], areas: ["hips"] });
    expect(CHECKS.BLOATED.trip(worn([p(10), p(3), p(7)]), lunch)).toBeNull();
  });

  it("BLOATED's fix is easy at the waist and hips", () => {
    const rule = CHECKS.BLOATED.rule(null, sage);
    expect([p(7), p(12), p(10), p(1), p(5), p(11)].map(rule.piece)).toEqual([true, true, true, false, false, false]);
    expect(CHECKS.BLOATED.notes(look([p(7)], p(8)), sage)).toEqual([
      { rule: "NOTHING_AT_WAIST", params: {} },
      { rule: "FALLS_FROM_SHOULDER", params: { fabric: "cream linen", footwear: "wedges" } },
    ]);
    expect(CHECKS.BLOATED.notes(look([p(12), p(4)], p(9)), sage)[1]).toEqual({ rule: "EASY_AT_WAIST", params: { fabric: "black top" } });
  });

  it("BAD_HAIR trips on hair styled down; its fix is built for hair up and drops the earrings", () => {
    expect(CHECKS.BAD_HAIR.trip(sage, lunch)).toEqual({ check: "BAD_HAIR" });
    expect(CHECKS.BAD_HAIR.trip(worn([p(5)]), lunch)).toBeNull();
    const rule = CHECKS.BAD_HAIR.rule(null, sage);
    expect([p(5), p(12), p(4), p(1), p(2)].map(rule.piece)).toEqual([true, true, true, false, false]);
    expect(CHECKS.BAD_HAIR.extras(sage)).toBe(NO_EXTRAS);
    expect(CHECKS.BAD_HAIR.notes(look([p(5)], p(8), { hair: p(15) }), sage)).toEqual([
      { rule: "HAIR_UP", params: { accessory: "claw clip" } },
      { rule: "PLAIN_CORE", params: { fabric: "black maxi" } },
    ]);
    expect(CHECKS.BAD_HAIR.notes(look([p(7)], p(8)), sage)).toEqual([{ rule: "HAIR_UP", params: {} }]);
  });

  it("PARTY_DATE trips on a day look, and steps up one level, never past cocktail", () => {
    expect(CHECKS.PARTY_DATE.trip(sage, lunch)).toEqual({
      check: "PARTY_DATE", colour: "sage", piece: "sage mini", bag: "straw bag", event: "lunch at 1", tempC: 31,
    });
    expect(CHECKS.PARTY_DATE.trip(worn([p(7)]), day())).toMatchObject({ bag: null, event: null, tempC: null });
    expect(CHECKS.PARTY_DATE.trip(worn([p(16)]), lunch)).toBeNull();
    const pieces = [p(16), p(17), p(18), p(7)];
    expect(pieces.map(CHECKS.PARTY_DATE.rule(null, sage).piece)).toEqual([true, false, false, false]);
    expect(pieces.map(CHECKS.PARTY_DATE.rule(null, null).piece)).toEqual([true, false, false, false]);
    expect(pieces.map(CHECKS.PARTY_DATE.rule(null, worn([])).piece)).toEqual([true, false, false, false]);
    expect(pieces.map(CHECKS.PARTY_DATE.rule(null, worn([p(18)])).piece)).toEqual([true, false, false, false]);
    expect(CHECKS.PARTY_DATE.extras(sage)).toEqual({ evening: true, earrings: null });
  });

  it("PARTY_DATE's note finishes the look, the same shoes or not", () => {
    expect(CHECKS.PARTY_DATE.notes(look([p(16)], p(8), { earrings: p(13), bag: p(14) }), sage)).toEqual([
      { rule: "AFTER_SIX", params: { fabric: "black slip" } },
      { rule: "EVENING_FINISH", params: { footwear: "wedges", same: 1, earrings: "gold hoops", bag: "straw bag" } },
    ]);
    expect(CHECKS.PARTY_DATE.notes(look([p(16)], p(9)), sage)[1]).toEqual({
      rule: "EVENING_FINISH", params: { footwear: "sneakers", same: 0 },
    });
  });

  it("runs in the site's order", () => {
    expect(CHECK_ORDER).toEqual(["NOT_WAXED", "BLOATED", "BAD_HAIR", "PARTY_DATE"]);
  });
});

describe("reasons", () => {
  const c = closetOf(
    [
      item(1, "DRESS", { colour: "sage", neckline: "strapless" }),
      item(2, "DRESS", { colour: "yellow", formality: 3, eveningOk: true }),
      item(3, "FOOTWEAR", { colour: "tan", footwear: { heelCm: 1, walkability: 5 } }),
      item(4, "FOOTWEAR", { colour: "white" }),
      item(5, "TOP", { colour: "grey" }),
      item(6, "BOTTOM", { colour: "grey" }),
      item(7, "DRESS", { colour: null }),
      item(8, "EARRINGS", { colour: "gold", subtype: "hoops" }),
      item(9, "HAIR_ACCESSORY", { subtype: "claw clip" }),
      item(10, "BAG"),
      item(11, "FOOTWEAR", { colour: null }),
      item(12, "TOP", { colour: "navy" }),
      item(13, "BOTTOM", { colour: "white" }),
      item(14, "TOP", { colour: "red" }),
      item(15, "BOTTOM", { colour: "green" }),
    ],
    [
      { wardrobeItemId: id(5), wearCount: 1, lastWornAt: "2026-07-01T00:00:00Z" },
      { wardrobeItemId: id(6), wearCount: 1, lastWornAt: "2026-06-14T00:00:00Z" },
    ],
  );
  const p = (n: number) => c.byId.get(id(n)) as Piece;
  const rules = (l: Worn, d = day()) => dayReasons(l, d).map((r) => r.rule);

  it("reads the day: slow, home then the gym, desk to drinks", () => {
    expect(rules(worn([p(2)], { footwear: p(4) }))).toEqual(["SLOW_DAY"]);
    const wfh = day([tag("WFH", null, null, { allDay: true }), tag("GYM", "19:00", "20:00")]);
    expect(dayReasons(worn([p(2)]), wfh)).toEqual([
      { rule: "WFH_THEN_GYM", params: {} },
      { rule: "FITS_DAY", params: { event: "a day at home" } },
    ]);
    const drinks = day([tag("OFFICE", "09:30", "17:00"), tag("DRINKS", "19:00", "21:00")]);
    expect(rules(worn([p(2)], { footwear: p(3) }), drinks)).toEqual(["DESK_TO_DRINKS", "FITS_DAY"]);
    expect(rules(worn([p(1)], { footwear: p(3) }), drinks)).toEqual(["FITS_DAY"]);
  });

  it("calls a long day only for polished pieces on walkable shoes", () => {
    const offsite = day([tag("OFFSITE", "09:00", "18:00", { allDay: true })]);
    expect(dayReasons(worn([p(2)], { footwear: p(3) }), offsite)[0]).toEqual({ rule: "LONG_DAY", params: { hours: 9 } });
    expect(rules(worn([p(2)], { footwear: p(4) }), offsite)).toEqual(["FITS_DAY"]);
    expect(rules(worn([p(2)]), offsite)).toEqual(["FITS_DAY"]);
    expect(rules(worn([p(1)], { footwear: p(3) }), offsite)).toEqual(["FITS_DAY"]);
    expect(rules(worn([p(2)], { footwear: p(3) }), day([tag("OFFICE", null, null, { allDay: true })]))).toEqual(["FITS_DAY"]);
  });

  it("names the month a forgotten piece was last out", () => {
    expect(dayReasons(worn([p(5), p(6)]), day())[1]).toEqual({ rule: "FORGOTTEN", params: { month: "June" } });
  });

  it("reads the heat: bare shoulders, a bag, or just light", () => {
    const hot = day([tag("LUNCH", "13:00", "14:30")], { tempMaxC: 31 });
    expect(rules(worn([p(1)], { bag: p(10) }), hot)).toEqual(["HOT_BARE", "HEAT_AND_BAG", "FITS_DAY"]);
    expect(dayReasons(worn([p(2)]), day([], { tempMaxC: 30 }))).toEqual([
      { rule: "SLOW_DAY", params: {} },
      { rule: "HOT_LIGHT", params: { event: "day" } },
    ]);
  });

  it("writes the stylist's pairs, earrings and hair", () => {
    expect(noteReasons(worn([p(1)], { footwear: p(3), earrings: p(8) }))).toEqual([
      { rule: "PAIR_SAME_WARMTH", params: { a: "sage", b: "tan" } },
      { rule: "EARRINGS_BARE_NECK", params: { earrings: "gold hoops" } },
    ]);
    expect(noteReasons(worn([p(5), p(6)], { hair: p(9), earrings: p(8) }))).toEqual([
      { rule: "PAIR_TONAL", params: { a: "grey" } },
      { rule: "EARRINGS_FINISH", params: { earrings: "gold hoops" } },
      { rule: "HAIR_UP", params: { accessory: "claw clip" } },
    ]);
    expect(noteReasons(worn([p(12), p(13)]))[0].rule).toBe("PAIR_NEUTRAL");
    expect(noteReasons(worn([p(14), p(15)]))[0].rule).toBe("PAIR_CONTRAST");
    expect(noteReasons(worn([p(7)], { footwear: p(3) }))).toEqual([]);
    expect(noteReasons(worn([p(1)]))).toEqual([]);
    expect(noteReasons(worn([p(1)], { footwear: p(11) }))).toEqual([]);
  });
});

describe("outfit rows", () => {
  const c = closetOf([item(1, "DRESS"), item(2, "FOOTWEAR"), item(3, "EARRINGS"), item(4, "LAYER"), item(5, "DUPATTA")]);
  const p = (n: number) => c.byId.get(id(n)) as Piece;

  it("reads a look back from its slots, dropping pieces that are gone or in the wrong slot", () => {
    const slots = { DRESS: id(1), TOP: id(2), FOOTWEAR: id(2), EARRINGS: id(9), LAYER: id(4), DUPATTA: id(5) };
    const row = outfitOf(slots, { id: id(99), kind: "DAY", occasion: null, plannedFor: MON, note: "", noteReasons: [], score: null });
    expect(lookOf(row, c)).toEqual({ ...EMPTY_LOOK, core: [p(1)], footwear: p(2), layer: p(4), dupatta: p(5) });
  });

  it("writes slots and item ids in outfit order, with the row defaults", () => {
    const slots = slotsOf(worn([p(1)], { footwear: p(2), earrings: p(3) }));
    expect(slots).toEqual({ DRESS: id(1), FOOTWEAR: id(2), EARRINGS: id(3) });
    expect(itemIdsOf({ EARRINGS: id(3), DRESS: id(1), FOOTWEAR: id(2) })).toEqual([id(1), id(2), id(3)]);
    const row = outfitOf(slots, { id: id(99), kind: "BACKUP", occasion: "CASUAL", plannedFor: null, note: "n", noteReasons: [], score: 1 });
    expect(row).toMatchObject({ backupCheck: null, restyleReason: null, forDay: null, fitsDays: [], status: "PROPOSED", composerVersion: COMPOSER_VERSION });
    expect(roundScore(2.123456)).toBe(2.1235);
  });
});
