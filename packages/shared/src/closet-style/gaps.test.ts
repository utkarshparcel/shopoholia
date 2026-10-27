import { describe, expect, it } from "vitest";
import { RULE_NEUTRALS, ringNeighbours } from "./colour.js";
import {
  DAY_TYPE_SLOTS,
  GAP_LIMITS,
  GAP_RULES,
  LIKE_GAP_SLOTS,
  PIECE_GAP_SLOTS,
  findGaps,
  gapKey,
} from "./gaps.js";
import type { GapInput, OccasionGapInput } from "./gaps.js";
import { BANNED_WORDS, GAP_WHY_TEMPLATES, gapWhat } from "./notes.js";
import { learnPalette } from "./palette.js";
import * as barrel from "./index.js";
import * as colourModule from "./colour.js";
import * as fabricsModule from "./fabrics.js";
import * as fieldsModule from "./fields.js";
import * as gapsModule from "./gaps.js";
import * as learnModule from "./learn.js";
import * as notesModule from "./notes.js";
import * as paletteModule from "./palette.js";
import * as proportionsModule from "./proportions.js";
import * as womenModule from "./rules/women.js";
import * as scoreModule from "./score.js";
import * as typesModule from "./types.js";
import type {
  DayType,
  Gap,
  GapCandidate,
  ItemSlot,
  Likes,
  LookCounter,
  Palette,
  Pattern,
  StyleAttributes,
  StyleColour,
  StyleDay,
  StyleItem,
  StyleMetric,
  StyleProfileInput,
} from "./types.js";

const BASE: Omit<StyleAttributes, "slot"> = {
  subtype: "",
  colours: [],
  pattern: "solid",
  materials: [],
  warmth: { minC: 10, maxC: 35 },
  rainOk: false,
  formality: 3,
  occasions: [],
  feel: [],
  coverage: {},
  fit: {},
  eveningOk: false,
  confidence: {},
};

let serial = 0;
/** A tagged item the user set, unless `source` says the model did. */
function item(
  slot: ItemSlot,
  a: Partial<StyleAttributes> = {},
  o: { source?: StyleItem["attributesSource"]; id?: string } = {},
): StyleItem {
  serial += 1;
  return {
    id: o.id ?? `${slot}-${serial}`,
    slot,
    materials: [],
    attributes: { ...BASE, slot, ...a },
    attributesSource: o.source ?? "USER",
    attributesConfirmed: {},
  };
}
const col = (name: string, hex: string, share = 1): StyleColour => ({ name, hex, share });
const TEAL_C = col("teal", "#008080");

const day = (date: string, dayType: DayType, over: Partial<StyleDay> = {}): StyleDay => ({
  date,
  dayType,
  highC: 28,
  rainChance: 0,
  humidity: null,
  longDay: false,
  hours: null,
  formality: 3,
  festive: false,
  ...over,
});
const likes = (over: Partial<Likes> = {}): Likes => ({ define: [], cover: [], sit: "either", ...over });
const profile = (l: Likes | null): StyleProfileInput => ({ version: 1, likes: l, proportions: null, learned: [] });

const EMPTY: Palette = { swatches: [], lean: null, neutrals: [], confidence: "low", basis: "owned", pieceCount: 0 };
const TEAL: Palette = {
  swatches: [
    { key: "teal-mid", family: "teal", band: "mid", hex: "#008080", weight: 0.7 },
    { key: "neutral-deep", family: "neutral", band: "deep", hex: "#111111", weight: 0.3 },
  ],
  lean: { temperature: "cool", chroma: "mid", depth: "mid" },
  neutrals: ["black"],
  confidence: "high",
  basis: "worn",
  pieceCount: 10,
};
const WARM: Palette = {
  swatches: [
    { key: "red-mid", family: "red", band: "mid", hex: "#b71c1c", weight: 0.4 },
    { key: "neutral-deep", family: "neutral", band: "deep", hex: "#111111", weight: 0.3 },
    { key: "teal-mid", family: "teal", band: "mid", hex: "#008080", weight: 0.2 },
    { key: "yellow-light", family: "yellow", band: "light", hex: "#fbc02d", weight: 0.1 },
  ],
  lean: { temperature: "warm", chroma: "bright", depth: "mid" },
  neutrals: ["black", "cream"],
  confidence: "high",
  basis: "worn",
  pieceCount: 30,
};

/** The colour part of a gap key, in the order the gaps try them. */
const TEAL_COLOURS = [
  "teal-mid:-",
  "neutral-any:black",
  "green-mid:-",
  "blue-mid:-",
  "neutral-any:white",
  "neutral-any:denim",
  "neutral-any:tan",
  "neutral-any:camel",
  "neutral-any:olive",
  "neutral-any:cream",
];

const SANGEET: OccasionGapInput = {
  date: "2026-11-07",
  label: "Riya's sangeet",
  weekday: "Saturday",
  slot: "KURTA",
  formality: 4,
  festive: true,
};

/** Every slot but LAYER and BLOUSE filled, four printed tops, a teal saree and shoes that don't suit rain. */
function closet(): StyleItem[] {
  const tops = (["floral", "stripe", "check", "print"] as Pattern[]).map((pattern) =>
    item("TOP", { subtype: "shirt", colours: [TEAL_C], pattern, sleeve: "short" }),
  );
  return [
    ...tops,
    item("BOTTOM", { subtype: "trousers", colours: [TEAL_C] }),
    item("DRESS", { subtype: "shift dress", colours: [TEAL_C] }),
    item("KURTA", { subtype: "kurta", colours: [TEAL_C], sleeve: "short" }),
    item("SAREE", { subtype: "saree", colours: [TEAL_C] }),
    item("FOOTWEAR", { subtype: "sneakers", colours: [col("black", "#111111")] }),
    item("BAG", { subtype: "tote", colours: [col("tan", "#c19a6b")] }),
    item("DUPATTA", { subtype: "dupatta", colours: [TEAL_C] }),
  ];
}

const WEEK: StyleDay[] = [
  day("2026-11-02", "work", { highC: 18, rainChance: 0.7 }),
  day("2026-11-03", "casual", { rainChance: 0.1 }),
  day("2026-11-07", "festive", { highC: 30, festive: true, formality: 4 }),
];

function input(over: Partial<GapInput> = {}): GapInput {
  return {
    items: closet(),
    palette: TEAL,
    profile: profile(likes({ cover: ["midriff"] })),
    days: WEEK,
    occasions: [SANGEET, { ...SANGEET, date: "2026-10-30", label: "Old dinner", slot: "DRESS", festive: false }],
    dismissed: [],
    today: "2026-11-02",
    ...over,
  };
}

/** A counter keyed on slot that records every candidate it's asked about. */
function counter(bySlot: Partial<Record<ItemSlot, number>> | number): LookCounter & { calls: GapCandidate[] } {
  const calls: GapCandidate[] = [];
  const fn = (c: GapCandidate): number => {
    calls.push(c);
    return typeof bySlot === "number" ? bySlot : (bySlot[c.slot] ?? 0);
  };
  return Object.assign(fn, { calls });
}

const SLOT_COUNTS: Partial<Record<ItemSlot, number>> = { KURTA: 2, BLOUSE: 6, LAYER: 4, FOOTWEAR: 8, DRESS: 3, BOTTOM: 5, TOP: 7 };
const keys = (gaps: readonly Gap[]): string[] => gaps.map((g) => g.key);
const colourKey = (c: GapCandidate): string => `${c.family}-${c.band ?? "any"}:${c.neutral ?? "-"}`;

describe("findGaps", () => {
  it("findGaps returns [] for an empty closet", () => {
    for (const items of [[], [{ ...item("TOP"), attributes: null, attributesSource: null }]] as StyleItem[][]) {
      const zero = counter(0);
      expect(findGaps(input({ items, palette: EMPTY, profile: null }), zero)).toEqual([]);
      // No tagged pieces means no gaps, whatever the counter would say.
      const generous = counter(9);
      expect(findGaps(input({ items, palette: learnPalette(items, []) }), generous)).toEqual([]);
      expect(generous.calls).toEqual([]);
    }
    // A counter that finds nothing new gives nothing, even for a closet with holes.
    expect(findGaps(input(), counter(0))).toEqual([]);
  });

  it("findGaps priorities and limits", () => {
    const count = counter(SLOT_COUNTS);
    const all = findGaps(input(), count, 50);
    expect(keys(all)).toEqual([
      "occasion:KURTA:teal-mid:-:festive:2026-11-07",
      "piece:FOOTWEAR:teal-mid:-:rain_ok",
      "piece:BLOUSE:teal-mid:-:-",
      "piece:LAYER:teal-mid:-:layer_warm",
      "colour:BOTTOM:neutral-any:black:-",
      "colour:DRESS:teal-mid:-:evening",
      "like:TOP:teal-mid:-:covers_midriff",
      "like:BLOUSE:teal-mid:-:covers_midriff",
    ]);
    expect(all.map((g) => g.unlocks)).toEqual([2, 8, 6, 4, 5, 3, 7, 6]);
    expect(all.map((g) => g.why)).toEqual([
      { id: "OCCASION_NO_LOOK", params: { label: "Riya's sangeet", weekday: "Saturday" } },
      { id: "RAIN_FOOTWEAR", params: {} },
      { id: "BLOUSE_FOR_SAREES", params: { count: 1 } },
      { id: "LAYER_COOL_MORNINGS", params: {} },
      { id: "NEUTRAL_BOTTOM_FOR_PRINTS", params: { count: 4 } },
      { id: "EVENING_IN_COLOURS", params: {} },
      { id: "LIKE_UNMET", params: { feature: "covers_midriff", dayTypes: "work,casual" } },
      { id: "LIKE_UNMET", params: { feature: "covers_midriff", dayTypes: "festive" } },
    ]);
    expect(all[0]!.forDate).toBe("2026-11-07");
    expect(all.slice(1).every((g) => g.forDate === null)).toBe(true);
    expect(all[0]!.what).toEqual({ slot: "KURTA", family: "teal", band: "mid", neutral: null, feature: "festive" });

    // Every candidate fits under the cap here, so each is counted once.
    expect(count.calls).toHaveLength(58);
    expect(new Set(count.calls.map((c) => JSON.stringify(c))).size).toBe(58);

    expect(keys(findGaps(input(), counter(SLOT_COUNTS)))).toEqual(keys(all).slice(0, 5));
    expect(keys(findGaps(input(), counter(SLOT_COUNTS), 2))).toEqual(keys(all).slice(0, 2));
    expect(findGaps(input(), counter(SLOT_COUNTS), 0)).toEqual([]);
  });

  it("ranks more unlocks first within a kind, then the earlier date, then the palette's own colour", () => {
    const occasions: OccasionGapInput[] = [
      { ...SANGEET, date: "2026-11-09", label: "Puja", slot: "SAREE" },
      { ...SANGEET, date: "2026-11-05", label: "Dinner", slot: "DRESS", festive: false },
      SANGEET,
    ];
    const gaps = findGaps(input({ occasions, profile: null }), counter(1), 50);
    // Equal unlocks: the earliest occasion leads.
    expect(keys(gaps.filter((g) => g.kind === "occasion"))).toEqual([
      "occasion:DRESS:teal-mid:-:evening:2026-11-05",
      "occasion:KURTA:teal-mid:-:festive:2026-11-07",
      "occasion:SAREE:teal-mid:-:festive:2026-11-09",
    ]);
    // Equal unlocks and no date: the palette's own colour beats a neighbour that sorts first by key.
    expect(gaps.find((g) => g.what.slot === "LAYER")?.key).toBe("piece:LAYER:teal-mid:-:layer_warm");

    const byColour: LookCounter = (c) => (c.slot === "LAYER" && c.family === "blue" ? 3 : 1);
    expect(findGaps(input(), byColour, 50).find((g) => g.what.slot === "LAYER")?.key).toBe(
      "piece:LAYER:blue-mid:-:layer_warm",
    );
  });

  it("findGaps dedupes per kind and slot", () => {
    const occasions = [SANGEET, { ...SANGEET, label: "Mehendi" }, SANGEET, { ...SANGEET, date: "2026-11-14" }];
    const count = counter(SLOT_COUNTS);
    const gaps = findGaps(input({ occasions }), count, 50);
    const pairs = gaps.map((g) => `${g.kind}:${g.what.slot}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(new Set(keys(gaps)).size).toBe(gaps.length);
    // The same date and slot is one key, counted once; the first label (by code unit) wins.
    const kurtaOccasions = count.calls.filter((c) => c.feature === "festive");
    expect(kurtaOccasions).toHaveLength(2);
    expect(gaps.filter((g) => g.kind === "occasion")).toEqual([
      {
        key: "occasion:KURTA:teal-mid:-:festive:2026-11-07",
        kind: "occasion",
        what: { slot: "KURTA", family: "teal", band: "mid", neutral: null, feature: "festive" },
        unlocks: 2,
        why: { id: "OCCASION_NO_LOOK", params: { label: "Mehendi", weekday: "Saturday" } },
        forDate: "2026-11-07",
      },
    ]);
  });

  it("findGaps honours dismissals until the date", () => {
    const shoes = "piece:FOOTWEAR:teal-mid:-:rain_ok";
    const hidden = (until: string, key = shoes) => {
      const count = counter(SLOT_COUNTS);
      const gaps = findGaps(input({ dismissed: [{ key, until }] }), count, 50);
      return { gaps: keys(gaps), counted: count.calls.filter((c) => c.feature === "rain_ok").length };
    };
    expect(hidden("2026-11-30").gaps).not.toContain(shoes);
    // Dismissing the gap hides it in every colour, and those candidates aren't counted.
    expect(hidden("2026-11-30").gaps.some((k) => k.startsWith("piece:FOOTWEAR:"))).toBe(false);
    expect(hidden("2026-11-30").counted).toBe(0);
    expect(hidden("2026-11-30", "piece:FOOTWEAR:blue-mid:-:rain_ok").counted).toBe(0);
    // On the day it lapses, and after, it is back.
    expect(hidden("2026-11-02").gaps).toContain(shoes);
    expect(hidden("2026-11-01").gaps).toContain(shoes);
    // Another kind or feature in the same slot isn't hidden.
    expect(hidden("2026-11-30", "like:FOOTWEAR:teal-mid:-:rain_ok").gaps).toContain(shoes);
    expect(hidden("2026-11-30", "piece:FOOTWEAR:teal-mid:-:-").gaps).toContain(shoes);

    const top = findGaps(input({ dismissed: [{ key: "like:TOP:green-mid:-:covers_midriff", until: "2027-01-31" }] }), counter(SLOT_COUNTS), 50);
    expect(keys(top).filter((k) => k.startsWith("like:"))).toEqual(["like:BLOUSE:teal-mid:-:covers_midriff"]);

    // An occasion is dismissed for its own date only.
    const twice = [SANGEET, { ...SANGEET, date: "2026-11-14", label: "Reception" }];
    const occ = findGaps(
      input({ occasions: twice, dismissed: [{ key: "occasion:KURTA:teal-mid:-:festive:2026-11-07", until: "2026-12-01" }] }),
      counter(SLOT_COUNTS),
      50,
    );
    expect(keys(occ).filter((k) => k.startsWith("occasion:"))).toEqual(["occasion:KURTA:teal-mid:-:festive:2026-11-14"]);
    expect(GAP_LIMITS.dismissDays).toBe(90);
  });

  it("findGaps is deterministic", () => {
    const run = (i: GapInput) => {
      const count = counter(SLOT_COUNTS);
      return { gaps: findGaps(i, count, 50), calls: count.calls };
    };
    const base = input({
      occasions: [SANGEET, { ...SANGEET, label: "Mehendi" }],
      dismissed: [{ key: "piece:LAYER:teal-mid:-:layer_warm", until: "2026-12-01" }],
    });
    const first = run(base);
    expect(run(base)).toEqual(first);
    const r = lcg(7);
    for (let n = 0; n < 5; n++) {
      const shuffled: GapInput = {
        ...base,
        items: shuffle(r, base.items),
        days: shuffle(r, base.days),
        occasions: shuffle(r, [...base.occasions, SANGEET]),
        dismissed: shuffle(r, [...base.dismissed, { key: "colour:DRESS:teal-mid:-:evening", until: "2026-10-01" }]),
      };
      const again = run(shuffled);
      expect(again.gaps).toEqual(first.gaps);
      expect(again.calls).toEqual(first.calls);
    }
  });

  it("findGaps never emits more than 60 counts", () => {
    expect(GAP_LIMITS.candidates).toBe(60);
    const tops = (["floral", "stripe", "check", "print"] as Pattern[]).map((pattern) =>
      item("TOP", { subtype: "shirt", colours: [TEAL_C], pattern }),
    );
    const allDays = (["work", "casual", "evening", "festive", "active"] as DayType[]).map((t, i) =>
      day(`2026-11-0${i + 2}`, t, { highC: 16, rainChance: 0.8 }),
    );
    const many = input({
      items: tops,
      days: allDays,
      profile: profile(likes({ define: ["waist"], cover: ["arms", "back"], sit: "fitted" })),
      occasions: [SANGEET, { ...SANGEET, slot: "SAREE" }, { ...SANGEET, date: "2026-11-05", slot: "DRESS", festive: false }],
    });
    const count = counter(1);
    const gaps = findGaps(many, count, 50);
    expect(count.calls).toHaveLength(GAP_LIMITS.candidates);
    // The counts are spread round-robin, so every kind still gets a gap.
    expect(new Set(gaps.map((g) => g.kind))).toEqual(new Set(["occasion", "piece", "colour", "like"]));
    expect(gaps.filter((g) => g.kind === "occasion")).toHaveLength(3);
    // Each gap's best colour was among those counted: the first colour of every kind and slot goes first.
    for (const g of gaps) expect(count.calls).toContainEqual(g.what);
    expect(count.calls.slice(0, 3).map((c) => c.slot)).toEqual(["DRESS", "KURTA", "SAREE"]);
  });

  it("gaps stay one step from the palette", () => {
    const r = lcg(2026);
    const randomItems = (n: number): StyleItem[] =>
      Array.from({ length: n }, () =>
        item(pick(r, RANDOM_SLOTS), {
          colours: Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({ ...pick(r, RANDOM_COLOURS), share: 0.5 })),
          pattern: pick(r, ["solid", "solid", "floral", "print"] as Pattern[]),
          eveningOk: r() < 0.2,
        }),
      );
    const cases: { items: StyleItem[]; palette: Palette }[] = [
      { items: closet(), palette: TEAL },
      { items: closet(), palette: WARM },
      { items: closet(), palette: EMPTY },
    ];
    for (let n = 0; n < 4; n++) {
      const items = randomItems(25);
      const metrics: StyleMetric[] = items.map((it) => ({ itemId: it.id, wears180: Math.floor(r() * 6) }));
      cases.push({ items, palette: learnPalette(items, metrics) });
    }
    for (const { items, palette } of cases) {
      const count = counter(1);
      findGaps(
        input({ items, palette, profile: profile(likes({ define: ["waist"], cover: ["arms", "legs", "midriff", "back"], sit: "relaxed" })) }),
        count,
        50,
      );
      expect(count.calls.length).toBeGreaterThan(0);
      for (const c of count.calls) expect(oneStep(c, palette), `${colourKey(c)} for ${JSON.stringify(palette.swatches)}`).toBe(true);
    }
  });

  it("uses black, white and denim when there is no palette", () => {
    const count = counter(1);
    findGaps(input({ palette: EMPTY, profile: null }), count, 50);
    expect([...new Set(count.calls.map(colourKey))]).toEqual(["neutral-any:black", "neutral-any:white", "neutral-any:denim"]);
  });

  it("orders the colours: swatches with the palette's neutrals, the ring neighbours, then other neutrals", () => {
    const count = counter(1);
    findGaps(input({ palette: WARM, profile: null, occasions: [] }), count, 50);
    const layer = count.calls.filter((c) => c.slot === "LAYER").map(colourKey);
    expect(layer).toEqual([
      "red-mid:-",
      "neutral-any:black",
      "neutral-any:cream",
      "teal-mid:-",
      "yellow-light:-",
      "pink-mid:-",
      "orange-mid:-",
      "brown-mid:-",
      "neutral-any:white",
      "neutral-any:denim",
      "neutral-any:tan",
      "neutral-any:camel",
      "neutral-any:olive",
    ]);
    const teal = counter(1);
    findGaps(input({ profile: null, occasions: [] }), teal, 50);
    expect(teal.calls.filter((c) => c.slot === "LAYER").map(colourKey)).toEqual(TEAL_COLOURS);
    // Evening gaps keep to the palette's own colours; the bottom for prints keeps to neutrals.
    expect(count.calls.filter((c) => c.feature === "evening").map(colourKey)).toEqual([
      "red-mid:-",
      "neutral-any:black",
      "neutral-any:cream",
      "teal-mid:-",
      "yellow-light:-",
    ]);
    expect(count.calls.filter((c) => c.slot === "BOTTOM").every((c) => c.family === "neutral")).toBe(true);
  });

  it("skips past occasions and takes evening or festive from the entry", () => {
    const gaps = findGaps(
      input({
        profile: null,
        occasions: [
          { ...SANGEET, date: "2026-11-01" },
          { ...SANGEET, date: "2026-11-02", label: "Office party", slot: "DRESS", festive: false },
        ],
      }),
      counter(1),
      50,
    );
    expect(gaps.filter((g) => g.kind === "occasion")).toEqual([
      {
        key: "occasion:DRESS:teal-mid:-:evening:2026-11-02",
        kind: "occasion",
        what: { slot: "DRESS", family: "teal", band: "mid", neutral: null, feature: "evening" },
        unlocks: 1,
        why: { id: "OCCASION_NO_LOOK", params: { label: "Office party", weekday: "Saturday" } },
        forDate: "2026-11-02",
      },
    ]);
    // With no palette, the occasion's colour is black.
    const plain = findGaps(input({ palette: EMPTY, profile: null }), counter(1), 50);
    expect(plain[0]!.key).toBe("occasion:KURTA:neutral-any:black:festive:2026-11-07");
  });

  it("finds the piece gaps a week needs", () => {
    const only = (items: StyleItem[], days: StyleDay[]) =>
      findGaps(input({ items, days, profile: null, occasions: [] }), counter(1), 50).filter((g) => g.kind === "piece");
    const top = item("TOP", { colours: [TEAL_C] });

    // A dry, warm office week: the empty slots office days use.
    const office = only([top], [day("2026-11-02", "work")]);
    expect(office.map((g) => g.what.slot).sort()).toEqual(
      PIECE_GAP_SLOTS.filter((s) => s !== "TOP" && s !== "BLOUSE" && DAY_TYPE_SLOTS.work.includes(s)).sort(),
    );
    expect(office.find((g) => g.what.slot === "DRESS")?.why).toEqual({
      id: "SLOT_MISSING",
      params: { slot: "DRESS", dayTypes: "work" },
    });
    expect(office.every((g) => g.why.id === "SLOT_MISSING" && g.what.feature === null)).toBe(true);

    // Day types are listed once each, in their usual order.
    const mixed = only([top], [day("2026-11-03", "casual"), day("2026-11-02", "work"), day("2026-11-04", "work")]);
    expect(mixed.find((g) => g.what.slot === "BAG")?.why.params).toEqual({ slot: "BAG", dayTypes: "work,casual" });

    // Rain asks for shoes that suit it, even when there are other shoes.
    const wet = [day("2026-11-02", "casual", { rainChance: GAP_RULES.rainChance })];
    const sneakers = item("FOOTWEAR", { colours: [col("white", "#ffffff")] });
    expect(only([top, sneakers], wet).find((g) => g.what.slot === "FOOTWEAR")?.why.id).toBe("RAIN_FOOTWEAR");
    expect(only([top, { ...sneakers, attributes: { ...sneakers.attributes!, rainOk: true } }], wet).some((g) => g.what.slot === "FOOTWEAR")).toBe(false);
    expect(only([top, sneakers], [day("2026-11-02", "casual", { rainChance: 0.59 })]).some((g) => g.what.slot === "FOOTWEAR")).toBe(false);
    expect(only([top], [day("2026-11-02", "casual", { rainChance: null })]).find((g) => g.what.slot === "FOOTWEAR")?.why.id).toBe("SLOT_MISSING");

    // A cool day asks for a layer; a warm week only lists it for office days.
    expect(only([top], [day("2026-11-02", "casual", { highC: GAP_RULES.coolHighC - 1 })]).find((g) => g.what.slot === "LAYER")?.why.id).toBe(
      "LAYER_COOL_MORNINGS",
    );
    expect(only([top], [day("2026-11-02", "casual", { highC: GAP_RULES.coolHighC })]).some((g) => g.what.slot === "LAYER")).toBe(false);
    expect(only([top], [day("2026-11-02", "casual", { highC: null })]).some((g) => g.what.slot === "LAYER")).toBe(false);

    // An untagged piece in a slot still fills it: "no bag yet" would be untrue.
    const rawBag: StyleItem = { ...item("BAG"), attributes: null, attributesSource: null };
    expect(only([top, rawBag], [day("2026-11-02", "casual")]).some((g) => g.what.slot === "BAG")).toBe(false);
    expect(only([top], [])).toEqual([]);
  });

  it("asks for a blouse only when a saree has none in its colours", () => {
    const sareeGaps = (items: StyleItem[]) =>
      findGaps(input({ items, days: [], profile: null, occasions: [] }), counter(1), 50).filter((g) => g.what.slot === "BLOUSE");
    const teal = item("SAREE", { colours: [TEAL_C, col("gold", "#d4a017", 0.2)] });
    const red = item("SAREE", { colours: [col("red", "#b71c1c")] });
    const tealBlouse = item("BLOUSE", { colours: [col("teal", "#0097a7")] });
    expect(sareeGaps([teal, red, tealBlouse])).toEqual([
      {
        key: "piece:BLOUSE:neutral-any:black:-",
        kind: "piece",
        what: { slot: "BLOUSE", family: "neutral", band: null, neutral: "black", feature: null },
        unlocks: 1,
        why: { id: "BLOUSE_FOR_SAREES", params: { count: 1 } },
        forDate: null,
      },
    ]);
    expect(sareeGaps([teal, tealBlouse])).toEqual([]);
    // With no blouse, the saree's own colours lead.
    expect(sareeGaps([teal])[0]?.key).toBe("piece:BLOUSE:teal-mid:-:-");
    expect(sareeGaps([teal, red])[0]?.why.params).toEqual({ count: 2 });
  });

  it("asks for evening colours and a neutral bottom only when they are missing", () => {
    const colourGaps = (items: StyleItem[], palette = TEAL) =>
      findGaps(input({ items, palette, days: [], profile: null, occasions: [] }), counter(1), 50)
        .filter((g) => g.kind === "colour")
        .map((g) => g.why.id)
        .sort();
    const prints = (["floral", "stripe", "check", "print"] as Pattern[]).map((pattern) => item("TOP", { colours: [TEAL_C], pattern }));
    expect(colourGaps(prints)).toEqual(["EVENING_IN_COLOURS", "NEUTRAL_BOTTOM_FOR_PRINTS"]);
    expect(colourGaps(prints.slice(0, GAP_RULES.busyTopsMin - 1))).toEqual(["EVENING_IN_COLOURS"]);
    expect(colourGaps([...prints, item("BOTTOM", { colours: [col("black", "#111111")] })])).toEqual(["EVENING_IN_COLOURS"]);
    expect(colourGaps([...prints, item("BOTTOM", { colours: [col("denim", "#3b5a7a")] })])).toEqual(["EVENING_IN_COLOURS"]);
    expect(colourGaps([...prints, item("DRESS", { colours: [TEAL_C], eveningOk: true })])).toEqual(["NEUTRAL_BOTTOM_FOR_PRINTS"]);
    // An evening piece outside the palette doesn't count.
    expect(colourGaps([...prints, item("DRESS", { colours: [col("pink", "#e0218a")], eveningOk: true })])).toContain("EVENING_IN_COLOURS");
    // With no palette there are no colours to be evening-ready in.
    expect(colourGaps(prints, EMPTY)).toEqual(["NEUTRAL_BOTTOM_FOR_PRINTS"]);
  });

  it("finds a like gap only through trusted fields, and for the day types it is unmet", () => {
    const likeGaps = (items: StyleItem[], l: Likes, days = [day("2026-11-02", "work"), day("2026-11-07", "festive")]) =>
      findGaps(input({ items, days, profile: profile(l), occasions: [] }), counter(1), 50).filter((g) => g.kind === "like");
    const waist = likes({ define: ["waist"] });
    const unsure = item("DRESS", { colours: [TEAL_C], fit: { waist: "defined" }, confidence: { "fit.waist": 0.5 } }, { source: "MODEL" });
    const sure = item("DRESS", { colours: [TEAL_C], fit: { waist: "defined" }, confidence: { fit: 0.9 } }, { source: "MODEL" });

    const open = likeGaps([unsure], waist);
    expect(open.map((g) => g.what.slot)).toEqual(LIKE_GAP_SLOTS.defines_waist);
    expect(open.map((g) => g.why.params.dayTypes)).toEqual(["work", "work,festive", "work"]);
    expect(open.every((g) => g.why.id === "LIKE_UNMET" && g.why.params.feature === "defines_waist")).toBe(true);

    // A trusted dress meets the like on office days; festive days still want a kurta that ties.
    const met = likeGaps([sure], waist);
    expect(met.map((g) => [g.what.slot, g.why.params.dayTypes])).toEqual([["KURTA", "festive"]]);
    expect(likeGaps([sure], waist, [day("2026-11-02", "work")])).toEqual([]);

    // No gap phrase for showing shoulders or legs; a zone in both lists is ignored.
    expect(likeGaps([unsure], likes({ define: ["shoulders", "legs"] }))).toEqual([]);
    expect(likeGaps([unsure], likes({ define: ["legs"], cover: ["legs"] }))).toEqual([]);
    expect(likeGaps([unsure], likes({ sit: "either" }))).toEqual([]);
    expect(likeGaps([unsure], likes({ sit: "relaxed" })).map((g) => g.what.slot).sort()).toEqual([...LIKE_GAP_SLOTS.relaxed].sort());
  });

  it("renders every gap through the gap templates, with no shop details", () => {
    const gaps = findGaps(input(), counter(SLOT_COUNTS), 50);
    const lines = gaps.map((g) => `${GAP_WHY_TEMPLATES[g.why.id](g.why.params)} | ${gapWhat(g.what)}`);
    expect(lines).toEqual([
      "Nothing in your closet fits Riya's sangeet on Saturday. | a teal kurta for festive days",
      "No shoes for rain. | a pair of teal shoes for rain",
      "No blouse that goes with one of your sarees. | a teal blouse",
      "Nothing to layer on cool mornings. | a teal layer for cool mornings",
      "No neutral bottom for four printed tops. | a black bottom",
      "Nothing evening-ready in your colours. | a teal dress for evenings",
      "Nothing covered through the middle for office and casual days. | a teal top covered through the middle",
      "Nothing covered through the middle for festive days. | a teal blouse covered through the middle",
    ]);
    const lower = lines.join(" ").toLowerCase();
    for (const word of BANNED_WORDS) expect(lower).not.toMatch(new RegExp(`\\b${word}\\b`));
    for (const g of gaps) {
      expect(Object.keys(g)).toEqual(["key", "kind", "what", "unlocks", "why", "forDate"]);
      expect(Object.keys(g.what)).toEqual(["slot", "family", "band", "neutral", "feature"]);
      expect(JSON.stringify(g)).not.toMatch(/https?:|₹|\$|price|brand/i);
      expect(gapKey(g.kind, g.what, g.forDate)).toBe(g.key);
    }
  });

  it("builds keys in the contract's format", () => {
    const c: GapCandidate = { slot: "LAYER", family: "neutral", band: null, neutral: "cream", feature: null };
    expect(gapKey("piece", c, null)).toBe("piece:LAYER:neutral-any:cream:-");
    expect(gapKey("occasion", { ...c, family: "teal", band: "deep", neutral: null, feature: "festive" }, "2026-11-07")).toBe(
      "occasion:LAYER:teal-deep:-:festive:2026-11-07",
    );
    // Only occasion keys carry the date.
    expect(gapKey("like", c, "2026-11-07")).toBe("like:LAYER:neutral-any:cream:-");
  });
});

describe("closet-style barrel", () => {
  it("re-exports every value each module exports", () => {
    const modules = [
      typesModule, fieldsModule, colourModule, paletteModule, fabricsModule, proportionsModule,
      womenModule, learnModule, notesModule, scoreModule, gapsModule,
    ];
    const exported = barrel as Record<string, unknown>;
    let n = 0;
    for (const m of modules) {
      for (const [name, value] of Object.entries(m)) {
        expect(exported[name], name).toBe(value);
        n += 1;
      }
    }
    expect(Object.keys(barrel)).toHaveLength(n);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A small seeded generator (Numerical Recipes LCG), so the shuffles and closets are repeatable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
function shuffle<T>(r: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const RANDOM_SLOTS: ItemSlot[] = ["TOP", "TOP", "BOTTOM", "DRESS", "KURTA", "SAREE", "BLOUSE", "FOOTWEAR", "BAG", "EARRINGS"];
const RANDOM_COLOURS: StyleColour[] = [
  col("magenta", "#e0218a"), col("orange", "#ff8c00"), col("mustard", "#d4a017"), col("teal", "#008080"),
  col("navy", "#1f3a93"), col("green", "#2e7d32"), col("red", "#b71c1c"), col("black", "#111111"),
  col("white", "#ffffff"), col("grey", "#c0c0c0"), col("denim", "#3b5a7a"), col("plum", "#6a1b9a"),
  col("brown", "#5d4037"), col("sky", "#90caf9"), col("cream", "bad-hex"),
];

/** A swatch's colour, a ring neighbour of the heaviest one at its band, or a neutral the gaps may use. */
function oneStep(c: GapCandidate, palette: Palette): boolean {
  if (c.family === "neutral") {
    if (c.band !== null || c.neutral === null) return false;
    if (palette.swatches.length === 0) return ["black", "white", "denim"].includes(c.neutral);
    return palette.neutrals.includes(c.neutral) || ["black", "white", ...RULE_NEUTRALS].includes(c.neutral);
  }
  if (c.neutral !== null || c.band === null) return false;
  if (palette.swatches.some((s) => s.family === c.family && s.band === c.band)) return true;
  const top = palette.swatches.find((s) => s.family !== "neutral");
  return top !== undefined && c.band === top.band && ringNeighbours(top.family).includes(c.family);
}
