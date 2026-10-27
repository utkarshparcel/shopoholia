import { describe, expect, it } from "vitest";
import type { CalendarTag, ClosetDayContext } from "../schemas/closet-context.js";
import type { ItemAttributes, ItemSlot } from "../schemas/closet-item.js";
import { addDays, dayMs, monthOf, weekday, weekdayName } from "./dates.js";
import { toDay } from "./day.js";
import { canonicalJson, sha256Hex } from "./hash.js";
import type { ComposerItemInput, ComposerMetric } from "./input.js";
import {
  checkCloset,
  checkDay,
  checkWeek,
  closetKey,
  ComposerItemSchema,
  ComposerSeedSchema,
  ComposerSettingsSchema,
  ComposeWeekInputSchema,
  parseInput,
} from "./input.js";
import type { Piece } from "./pieces.js";
import {
  availableOn,
  bagName,
  bareNeck,
  buildCloset,
  describe as describePiece,
  fabric,
  goes,
  hairUpOk,
  harmony,
  isPlural,
  laundryOf,
  legPiece,
  mean,
  pieceName,
  relation,
  slotPieces,
  toneOf,
} from "./pieces.js";
import { hash32, seededUuid, tieBreak } from "./rng.js";

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

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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

function closet(items: ComposerItemInput[], metrics: ComposerMetric[] = [], settings: unknown = {}, asOf = "2026-11-09") {
  return buildCloset(
    items.map((i) => ComposerItemSchema.parse(i)),
    metrics,
    ComposerSettingsSchema.parse(settings),
    "7",
    asOf,
  );
}

function one(i: ComposerItemInput, metrics: ComposerMetric[] = [], settings: unknown = {}): Piece {
  return closet([i], metrics, settings).pieces[0];
}

function tag(kind: CalendarTag["kind"], start: string | null = null, end: string | null = null, more: Partial<CalendarTag> = {}): CalendarTag {
  return { startLocal: start, endLocal: end, kind, formality: null, outdoor: false, allDay: false, ...more };
}

function ctx(events: CalendarTag[], weather: Partial<NonNullable<ClosetDayContext["weather"]>> | null = {}): ClosetDayContext {
  const date = "2026-11-09";
  return {
    date,
    weather:
      weather === null
        ? null
        : { date, tempMinC: 18, tempMaxC: 24, rainChance: 0.1, condition: "sunny", provider: "test", ...weather },
    events,
  };
}

describe("dates", () => {
  it("does calendar arithmetic without the clock", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-11-09", -1)).toBe("2026-11-08");
    expect(weekday("2026-11-09")).toBe(0);
    expect(weekday("2026-11-15")).toBe(6);
    expect(weekdayName("2026-11-12")).toBe("Thursday");
    expect(dayMs("2026-11-09")).toBe(Date.UTC(2026, 10, 9));
    expect(monthOf("2026-06-14T19:00:00Z")).toBe("June");
  });
});

describe("hashing", () => {
  it("matches sha256 test vectors across UTF-8 widths, block edges and lone surrogates", () => {
    const vectors: [string, string][] = [
      ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
      ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
      ["é€’😀", "9cfd360bf3daee00085a1e2596a733a5b7afe8fc99a57bb460019e439ed88fe1"],
      ["\ud800x", "a87ce46793cc659b79bd187e998f8488635f707d5be0957e1d565981efd2b04b"],
      ["\udc00", "83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097"],
      ["a".repeat(100), "2816597888e4a0d3a36b82b83316ab32680eb8f00f8cd3b904d681246d285a0e"],
      ["x".repeat(55), "d5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072"],
      ["x".repeat(56), "04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e"],
    ];
    for (const [text, hex] of vectors) expect(sha256Hex(text)).toBe(hex);
  });

  it("writes canonical JSON: sorted keys, undefined dropped", () => {
    expect(canonicalJson({ b: 1, a: [1, "x", null], c: undefined, d: { z: true, y: undefined } })).toBe(
      '{"a":[1,"x",null],"b":1,"d":{"z":true}}',
    );
    expect(canonicalJson(undefined)).toBe("null");
    expect(canonicalJson([])).toBe("[]");
    expect(canonicalJson({})).toBe("{}");
  });

  it("derives stable hashes, tie-breaks under 0.001 and version-8 UUIDs", () => {
    expect(hash32("sage")).toBe(hash32("sage"));
    expect(hash32("sage")).not.toBe(hash32("sagf"));
    for (let i = 0; i < 50; i++) {
      const t = tieBreak([i, hash32(String(i))]);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(0.001);
      expect(seededUuid(String(i), "key")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(seededUuid("1", "a")).toBe(seededUuid("1", "a"));
    expect(seededUuid("1", "a")).not.toBe(seededUuid("2", "a"));
  });
});

describe("inputs", () => {
  it("reads a seed as a number, a digit string or a bigint", () => {
    expect(ComposerSeedSchema.parse(42)).toBe("42");
    expect(ComposerSeedSchema.parse("-42")).toBe("-42");
    expect(ComposerSeedSchema.parse(42n)).toBe("42");
    expect(ComposerSeedSchema.safeParse(1.5).success).toBe(false);
    expect(ComposerSeedSchema.safeParse("4e2").success).toBe(false);
  });

  it("returns at most 20 issues, with dotted paths", () => {
    const r = parseInput(ComposeWeekInputSchema, { weekStart: "x", days: [], items: Array.from({ length: 30 }, () => ({})), seed: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("INVALID_INPUT");
      expect(r.error.issues).toHaveLength(20);
      expect(r.error.issues[0].path).toBe("weekStart");
    }
  });

  it("finds duplicate items and metrics", () => {
    const a = ComposerItemSchema.parse(item(1, "DRESS"));
    const metric = { wardrobeItemId: id(1), wearCount: 1, lastWornAt: null };
    expect(checkCloset([a, a], [])?.issues[0].path).toBe("items.1.id");
    expect(checkCloset([a], [metric, metric])?.issues[0].path).toBe("metrics.1.wardrobeItemId");
    expect(checkCloset([a], [metric])).toBeNull();
  });

  it("checks a day's forecast and plan date, and a week's seven days", () => {
    const day = { date: "2026-11-09", weather: { date: "2026-11-10" } };
    expect(checkDay(day, null, "p")?.code).toBe("WRONG_DAYS");
    expect(checkDay({ ...day, weather: null }, "2026-11-10", "p")).toMatchObject({ code: "WRONG_DATE", issues: [{ path: "p" }] });
    expect(checkDay({ ...day, weather: null }, "2026-11-09", "p")).toBeNull();
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays("2026-11-09", i), weather: null }));
    expect(checkWeek("2026-11-10", days)?.code).toBe("NOT_A_MONDAY");
    expect(checkWeek("2026-11-09", days)).toBeNull();
    expect(checkWeek("2026-11-09", [...days.slice(0, 6), days[5]])?.issues[0].path).toBe("days.6.date");
    const wrongWeather = days.map((d, i) => (i === 3 ? { ...d, weather: { date: "2026-11-09" } } : d));
    expect(checkWeek("2026-11-09", wrongWeather)?.issues[0].path).toBe("days.3.weather.date");
  });

  it("keys the closet in id order", () => {
    const a = ComposerItemSchema.parse(item(1, "DRESS"));
    const b = ComposerItemSchema.parse(item(2, "DRESS"));
    const m = (n: number) => ({ wardrobeItemId: id(n), wearCount: 0, lastWornAt: null });
    const settings = ComposerSettingsSchema.parse(undefined);
    expect(closetKey({ items: [b, a], metrics: [m(2), m(1)], settings, seed: "1" })).toEqual(
      closetKey({ items: [a, b], metrics: [m(1), m(2)], settings, seed: "1" }),
    );
  });

  it("keys records whatever order their keys arrive in, and tells tagged from untagged", () => {
    const key = (more: Partial<ComposerItemInput>, attrs: Partial<ItemAttributes> = {}) =>
      closetKey({
        items: [ComposerItemSchema.parse(item(1, "TOP", attrs, more))],
        metrics: [],
        settings: ComposerSettingsSchema.parse(undefined),
        seed: "1",
      });
    const ab = key({ attributesConfirmed: { fit: true, coverage: false } }, { confidence: { hair: 0.9, coverage: 0.5 } });
    const ba = key({ attributesConfirmed: { coverage: false, fit: true } }, { confidence: { coverage: 0.5, hair: 0.9 } });
    expect(ab).toBe(ba);
    expect(ab).toContain('["coverage",false,"fit",true]');
    expect(key({ attributesConfirmed: { fit: false, coverage: false } }, { confidence: { hair: 0.9, coverage: 0.5 } })).not.toBe(ab);
    expect(key({ attributes: null })).not.toBe(key({}));
  });
});

describe("laundry rules", () => {
  it("normalises like the universe: 3 wears and the sweat rule by default", () => {
    expect(laundryOf(null)).toEqual({ afterWears: 3, sweat: true });
    expect(laundryOf({ dirtyAfterWears: null })).toEqual({ afterWears: null, sweat: true });
    expect(laundryOf({ dirtyAfterWears: 5.7, dirtyOnSweatTag: false })).toEqual({ afterWears: 5, sweat: false });
    expect(laundryOf({ dirtyAfterWears: 100 })).toEqual({ afterWears: 30, sweat: true });
    expect(laundryOf({ dirtyAfterWears: 0 })).toEqual({ afterWears: 3, sweat: true });
  });

  it("gives washed pieces the wears left before a wash, and the rest no limit", () => {
    const metrics = [
      { wardrobeItemId: id(1), wearCount: 4, lastWornAt: null },
      { wardrobeItemId: id(2), wearCount: 4, lastWornAt: null },
    ];
    const c = closet([item(1, "DRESS"), item(2, "FOOTWEAR")], metrics);
    expect(c.byId.get(id(1))?.capacity).toBe(2);
    expect(c.byId.get(id(2))?.capacity).toBe(Infinity);
    expect(one(item(1, "DRESS"), [], { laundryRules: { dirtyAfterWears: null } }).capacity).toBe(Infinity);
  });
});

describe("pieces", () => {
  it("reads every field off the attributes", () => {
    const p = one(
      item(1, "DRESS", {
        subtype: "Mini",
        colours: [{ name: "Light Blue", hex: "#aaccee", share: 1 }],
        materials: ["Linen"],
        warmth: { minC: 18, maxC: 30 },
        rainOk: true,
        formality: 4,
        occasions: ["Dinner"],
        feel: ["sporty"],
        sleeve: "short",
        neckline: "v",
        silhouette: "a_line",
        coverage: { legs: "knee" },
        eveningOk: true,
      }),
    );
    expect(p).toMatchObject({
      slot: "DRESS",
      subtype: "mini",
      colour: "light blue",
      tone: "blue",
      material: "linen",
      solid: true,
      formality: 4,
      warmMin: 18,
      warmMax: 30,
      rainOk: true,
      eveningOk: true,
      occasions: ["dinner"],
      sporty: true,
      sleeve: "short",
      neckline: "v",
      silhouette: "a_line",
      rawLegs: "knee",
      coverage: { legs: "knee" },
      wearCount: 0,
      lastWornAt: null,
      washed: true,
      clean: true,
    });
  });

  it("lets the item columns override the attributes", () => {
    const p = one(
      item(1, "TOP", { pattern: "floral", subtype: "" }, {
        slot: "KURTA",
        category: "Kurta",
        colors: ["  ", "Red"],
        materials: ["Silk"],
        formality: 5,
        warmthMinC: 10,
        warmthMaxC: 20,
      }),
    );
    expect(p).toMatchObject({
      slot: "KURTA", subtype: "kurta", colour: "red", material: "silk", solid: false, formality: 5, warmMin: 10, warmMax: 20,
    });
  });

  it("reads an untagged item from its columns, and skips it without a slot", () => {
    const bare = one(item(1, "TOP", {}, { attributes: null, slot: "TOP", category: "Tee" }));
    expect(bare).toMatchObject({
      subtype: "tee", colour: null, tone: null, material: null, solid: false, formality: 3,
      warmMin: null, warmMax: null, rainOk: null, eveningOk: null, occasions: [], sporty: false,
      walkability: null, sleeve: null, neckline: null, silhouette: null, rawLegs: null,
      coverage: {}, fit: {}, hair: {},
    });
    expect(closet([item(1, "TOP", {}, { attributes: null })]).pieces).toHaveLength(0);
  });

  it("leaves out deleted and stored items", () => {
    const c = closet([
      item(1, "TOP", {}, { deletedAt: "2026-11-01T00:00:00Z" }),
      item(2, "TOP", {}, { closetStatus: "STORED" }),
      item(3, "TOP"),
    ]);
    expect(c.pieces.map((p) => p.id)).toEqual([id(3)]);
    expect(slotPieces(c, "DRESS")).toEqual([]);
    expect(slotPieces(c, "TOP")).toHaveLength(1);
  });

  it("marks active pieces sporty", () => {
    expect(one(item(1, "ACTIVE_TOP")).sporty).toBe(true);
    expect(one(item(1, "ACTIVE_BOTTOM")).sporty).toBe(true);
    expect(one(item(1, "TOP")).sporty).toBe(false);
    expect(one(item(1, "FOOTWEAR", { footwear: { heelCm: 1, walkability: 5 } })).walkability).toBe(5);
  });

  it("trusts body fields the user set or confirmed, or the model is sure of", () => {
    const body = { coverage: { shoulders: "bare", legs: "floor" }, fit: { waist: "fitted", hip: "relaxed" }, hair: { styledDown: true } } as const;
    const model = (more: Partial<ComposerItemInput>, confidence: Record<string, number> = {}) =>
      one(item(1, "DRESS", { ...body, confidence }, { attributesSource: "MODEL", ...more }));
    expect(model({}).coverage).toEqual({});
    expect(model({}, { "coverage.legs": 0.9, fit: 0.85, hair: 0.5 })).toMatchObject({
      coverage: { legs: "floor" }, fit: { waist: "fitted", hip: "relaxed" }, hair: {},
    });
    expect(model({ attributesConfirmed: { "coverage.shoulders": true, hair: true } })).toMatchObject({
      coverage: { shoulders: "bare" }, hair: { styledDown: true },
    });
    expect(model({}).rawLegs).toBe("floor");
    expect(one(item(1, "DRESS", body)).coverage).toEqual(body.coverage);
  });

  it("scores under-worn pieces higher: fewer wears, longer ago, dearer per wear", () => {
    const c = closet(
      [
        item(1, "DRESS", {}, { costMinor: 600000, priceSource: "USER" }),
        item(2, "DRESS", {}, { costMinor: 600000, priceSource: "USER" }),
        item(3, "DRESS", {}, { costMinor: 600000, priceSource: "NONE" }),
        item(4, "DRESS"),
      ],
      [
        { wardrobeItemId: id(1), wearCount: 1, lastWornAt: null },
        { wardrobeItemId: id(2), wearCount: 40, lastWornAt: "2026-11-08T10:00:00Z" },
        { wardrobeItemId: id(3), wearCount: 1, lastWornAt: "2026-11-10T10:00:00Z" },
      ],
    );
    const u = (n: number) => c.byId.get(id(n))?.underworn as number;
    expect(u(1)).toBeCloseTo(1 / (1 + 1 / 6) + 0.6 + 0.4, 6);
    expect(u(2)).toBeLessThan(u(1));
    expect(u(3)).toBeCloseTo(1 / (1 + 1 / 6), 6);
    expect(u(4)).toBeCloseTo(1.6, 6);
  });

  it("is free on a day when clean, home and back in time", () => {
    const at = (more: Partial<ComposerItemInput>) => one(item(1, "DRESS", {}, more));
    expect(availableOn(at({}), "2026-11-09", "2026-11-09")).toBe(true);
    expect(availableOn(at({ laundryStatus: "DIRTY" }), "2026-11-09", "2026-11-09")).toBe(false);
    const lent = at({ lentTo: "Asha", lentDueOn: "2026-11-10" });
    expect(availableOn(lent, "2026-11-10", "2026-11-09")).toBe(false);
    expect(availableOn(lent, "2026-11-11", "2026-11-09")).toBe(true);
    expect(availableOn(lent, "2026-11-12", "2026-11-11")).toBe(false);
    expect(availableOn(at({ lentTo: "Asha" }), "2026-12-30", "2026-11-09")).toBe(false);
    const tailor = at({ tailorOrderId: id(9), tailorPickupOn: "2026-11-09" });
    expect(availableOn(tailor, "2026-11-10", "2026-11-09")).toBe(true);
    expect(availableOn(at({ dryCleanTicket: "T1", dryCleanPickupOn: null }), "2026-11-10", "2026-11-09")).toBe(false);
    expect(at({ dryCleanTicket: "T1", dryCleanPickupOn: "2026-11-12", lentTo: "Asha", lentDueOn: "2026-11-13" }).awayUntil).toEqual([
      "2026-11-13",
      "2026-11-12",
    ]);
  });
});

describe("colour", () => {
  const colour = (name: string | null) =>
    one(item(1, "TOP", { colours: [{ name: name ?? " ", hex: "#000000", share: 1 }] }));

  it("relates two tones", () => {
    expect(relation("sage", "sage")).toBe("TONAL");
    expect(relation("sage", "tan")).toBe("SAME_WARMTH");
    expect(relation("navy", "teal")).toBe("SAME_WARMTH");
    expect(relation("navy", "white")).toBe("NEUTRAL");
    expect(relation("red", "black")).toBe("NEUTRAL");
    expect(relation("red", "green")).toBe("CONTRAST");
    expect(relation("tan", "beige")).toBe("SAME_WARMTH");
    expect(relation("magenta", "black")).toBe("NEUTRAL");
    expect(relation("black", "magenta")).toBe("NEUTRAL");
    expect(relation("magenta", "fuchsia")).toBe("CONTRAST");
    expect(toneOf("light blue")).toBe("blue");
  });

  it("scores harmony, 0.4 when a colour is unknown", () => {
    expect(harmony(colour("sage"), colour("tan"))).toBe(1);
    expect(harmony(colour("sage"), colour("sage"))).toBe(0.8);
    expect(harmony(colour("red"), colour("white"))).toBe(0.7);
    expect(harmony(colour("red"), colour("green"))).toBe(0.2);
    expect(harmony(colour(null), colour("green"))).toBe(0.4);
    expect(harmony(colour("green"), colour(null))).toBe(0.4);
  });

  it("says two pieces go when both colours are known and don't clash", () => {
    expect(goes(colour("sage"), colour("tan"))).toBe(true);
    expect(goes(colour("red"), colour("green"))).toBe(false);
    expect(goes(colour(null), colour("tan"))).toBe(false);
    expect(goes(colour("tan"), colour(null))).toBe(false);
  });
});

describe("names", () => {
  it("names fabric, pieces and bags", () => {
    const named = (attrs: Partial<ItemAttributes>) => one(item(1, "BAG", { subtype: "clutch", ...attrs }));
    const blank = [{ name: "", hex: "#000000", share: 1 }];
    expect(fabric(named({ colours: [{ name: "Black", hex: "#000", share: 1 }], materials: ["satin"] }))).toBe("black satin");
    expect(fabric(named({ colours: [{ name: "Black", hex: "#000", share: 1 }] }))).toBe("black clutch");
    expect(fabric(named({ colours: blank, materials: ["satin"] }))).toBe("satin");
    expect(fabric(named({ colours: blank }))).toBe("clutch");
    expect(pieceName(named({}))).toBe("black clutch");
    expect(pieceName(named({ colours: blank }))).toBe("clutch");
    expect(bagName(named({ materials: ["straw"], subtype: "bag" }))).toBe("straw bag");
    expect(bagName(named({}))).toBe("clutch");
    expect(isPlural("shorts")).toBe(true);
    expect(isPlural("dress")).toBe(false);
    expect(isPlural("look")).toBe(false);
  });

  it("describes a piece by what it shows", () => {
    const dress = (attrs: Partial<ItemAttributes>) => one(item(1, "DRESS", { subtype: "mini", colours: [{ name: "sage", hex: "#000", share: 1 }], ...attrs }));
    expect(describePiece(dress({ neckline: "strapless" }))).toBe("strapless mini");
    expect(describePiece(dress({ neckline: "one_shoulder" }))).toBe("one-shoulder mini");
    expect(describePiece(dress({ neckline: "v", sleeve: "sleeveless" }))).toBe("sleeveless mini");
    expect(describePiece(dress({ neckline: "v" }))).toBe("sage mini");
    expect(describePiece(dress({}))).toBe("sage mini");
  });

  it("reads bare necks, hair up and the piece covering the most leg", () => {
    const p = (slot: ItemSlot, attrs: Partial<ItemAttributes>) => one(item(1, slot, attrs));
    expect(bareNeck([p("DRESS", { neckline: "halter" })])).toBe(true);
    expect(bareNeck([p("DRESS", { coverage: { shoulders: "bare" } })])).toBe(true);
    expect(bareNeck([p("DRESS", { neckline: "crew", coverage: { shoulders: "covered" } })])).toBe(false);
    expect(hairUpOk([p("DRESS", { hair: { upFriendly: true } }), p("BOTTOM", {})])).toBe(true);
    expect(hairUpOk([p("TOP", { hair: { upFriendly: false } })])).toBe(false);
    const knee = p("BOTTOM", { coverage: { legs: "knee" } });
    const floor = p("BOTTOM", { coverage: { legs: "floor" } });
    const none = p("TOP", {});
    expect(legPiece([none, knee, floor])).toBe(floor);
    expect(legPiece([floor, knee])).toBe(floor);
    expect(legPiece([none])).toBeNull();
    expect(mean([1, 2, 6])).toBe(3);
  });
});

describe("toDay", () => {
  it("reads the forecast: rain by chance, else by condition, and heat from 27 °C", () => {
    expect(toDay(ctx([], { rainChance: 0.6 })).rainy).toBe(true);
    expect(toDay(ctx([], { rainChance: 0.59 })).rainy).toBe(false);
    expect(toDay(ctx([], { rainChance: null, condition: "rain" })).rainy).toBe(true);
    expect(toDay(ctx([], { rainChance: null, condition: "cloudy" })).rainy).toBe(false);
    expect(toDay(ctx([], { tempMaxC: 27 })).hot).toBe(true);
    expect(toDay(ctx([], { tempMaxC: null })).hot).toBe(false);
    expect(toDay(ctx([], null))).toMatchObject({ high: null, low: null, rainy: false, hot: false });
  });

  it("plans a slow day around home", () => {
    const d = toDay(ctx([]));
    expect(d).toMatchObject({ index: 0, name: "Monday", band: null, target: 2, out: false, occasion: "CASUAL", label: "Slow day" });
    expect([...d.keywords]).toEqual(["casual", "home", "lounge", "weekend"]);
  });

  it("makes a gym day with only home or a walk around it active", () => {
    const gym = toDay(ctx([tag("WFH", null, null, { allDay: true }), tag("GYM", "19:00", "20:00")]));
    expect(gym).toMatchObject({ active: true, occasion: "SPORT", evening: false, out: false, band: [1, 2] });
    const work = toDay(ctx([tag("OFFICE", "09:00", "17:00"), tag("GYM", "18:00", "19:00")]));
    expect(work).toMatchObject({ active: false, occasion: "WORK", band: [2, 4], out: true, long: true });
  });

  it("sets the formality band within a step of every event, or the most formal one's", () => {
    expect(toDay(ctx([tag("OFFICE"), tag("WEDDING")])).band).toEqual([4, 4]);
    expect(toDay(ctx([tag("LUNCH"), tag("WEDDING")])).band).toEqual([4, 5]);
    expect(toDay(ctx([tag("LUNCH", null, null, { formality: 5 })])).band).toEqual([4, 5]);
    expect(toDay(ctx([tag("GYM", null, null, { formality: 1 })])).band).toEqual([1, 2]);
    expect(toDay(ctx([tag("OTHER")]))).toMatchObject({ band: null, target: 2 });
  });

  it("finds evenings, long walks and long work days", () => {
    expect(toDay(ctx([tag("DINNER", "20:00", "22:00")])).evening).toBe(true);
    expect(toDay(ctx([tag("MEETING", "18:30", "19:30")])).evening).toBe(true);
    expect(toDay(ctx([tag("WALK", "18:30", "19:30")])).evening).toBe(false);
    expect(toDay(ctx([tag("MEETING")])).evening).toBe(false);
    expect(toDay(ctx([tag("WALK", "13:00", "15:00")]))).toMatchObject({ longWalk: true, long: true });
    expect(toDay(ctx([tag("WALK")]))).toMatchObject({ longWalk: false, long: false });
    expect(toDay(ctx([tag("OFFICE", "09:00", "16:00")])).long).toBe(false);
    expect(toDay(ctx([tag("OFFICE", null, null, { allDay: true })])).long).toBe(false);
    expect(toDay(ctx([tag("BRUNCH")])).occasion).toBe("CASUAL");
    expect(toDay(ctx([tag("DATE")])).occasion).toBe("PARTY");
  });
});
