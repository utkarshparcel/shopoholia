import { describe, expect, it } from "vitest";
import { harmony } from "./colour.js";
import { fabricTerm } from "./fabrics.js";
import { learnPalette, paletteScore } from "./palette.js";
import {
  ACCENT_SLOTS,
  FESTIVE_MIN_FORMALITY,
  METAL_SLOTS,
  METAL_WEIGHT,
  STYLE_WEIGHTS,
  featuresOf,
  lookTerms,
  pairHarmony,
  pieceTerms,
  prepareStylePiece,
  weighted,
} from "./score.js";
import type { StyleContext, StylePiece } from "./score.js";
import { ZERO_TERM } from "./types.js";
import type {
  Bucket,
  CoverLike,
  DayType,
  DefineLike,
  FeaturePref,
  Feel,
  ItemSlot,
  Likes,
  Palette,
  Pattern,
  Proportions,
  StyleAttributes,
  StyleColour,
  StyleDay,
  StyleItem,
  StyleMetric,
  StyleProfileInput,
  Term,
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

interface ItemOpts {
  id?: string;
  source?: StyleItem["attributesSource"];
  confirmed?: Record<string, boolean>;
  materials?: string[];
}

/** A tagged item. The user set it (every shape field trusted) unless `source` says otherwise. */
function item(slot: ItemSlot, a: Partial<StyleAttributes> = {}, o: ItemOpts = {}): StyleItem {
  const materials = o.materials ?? [];
  return {
    id: o.id ?? `${slot}:${a.subtype ?? ""}`,
    slot,
    materials,
    attributes: { ...BASE, slot, ...a, materials },
    attributesSource: o.source ?? "USER",
    attributesConfirmed: o.confirmed ?? {},
  };
}

const col = (name: string, hex: string, share = 1): StyleColour => ({ name, hex, share });
const day = (over: Partial<StyleDay> = {}): StyleDay => ({
  date: "2026-11-02",
  dayType: "work",
  highC: 26,
  rainChance: 0,
  humidity: null,
  longDay: false,
  hours: null,
  formality: 3,
  festive: false,
  ...over,
});
const likes = (over: Partial<Likes> = {}): Likes => ({ define: [], cover: [], sit: "either", ...over });
const bucket = <V extends string>(value: V, confidence = 1): Bucket<V> => ({ value, confidence, source: "TAPE" });
const props = (over: Partial<Proportions> = {}): Proportions => ({ waist: null, balance: null, torso: null, ...over });
const profile = (over: Partial<StyleProfileInput> = {}): StyleProfileInput => ({
  version: 1,
  likes: null,
  proportions: null,
  learned: [],
  ...over,
});
const pref = (dayType: DayType, feature: FeaturePref["feature"], value: number, support = 4): FeaturePref => ({
  dayType,
  feature,
  value,
  support,
});

const EMPTY: Palette = { swatches: [], lean: null, neutrals: [], confidence: "low", basis: "owned", pieceCount: 0 };
const WARM: Palette = {
  swatches: [
    { key: "red-mid", family: "red", band: "mid", hex: "#b71c1c", weight: 0.6 },
    { key: "neutral-deep", family: "neutral", band: "deep", hex: "#111111", weight: 0.4 },
  ],
  lean: { temperature: "warm", chroma: "bright", depth: "mid" },
  neutrals: ["black"],
  confidence: "high",
  basis: "worn",
  pieceCount: 40,
};
const COOL: Palette = {
  ...WARM,
  swatches: [
    { key: "blue-deep", family: "blue", band: "deep", hex: "#1f3a93", weight: 0.6 },
    { key: "neutral-deep", family: "neutral", band: "deep", hex: "#111111", weight: 0.4 },
  ],
  lean: { temperature: "cool", chroma: "bright", depth: "deep" },
};
const MIXED: Palette = { ...WARM, lean: { temperature: "mixed", chroma: "mid", depth: "mid" } };

const ctx = (palette: Palette, p: StyleProfileInput | null = null): StyleContext => ({ profile: p, palette });

/** A look's whole style score, as the composer forms it: each piece's terms plus the look's. */
function lookScore(look: readonly StylePiece[], d: StyleDay, c: StyleContext): number {
  return look.reduce((sum, p) => sum + weighted(pieceTerms(p, d, c)), 0) + weighted(lookTerms(look, d, c));
}

describe("prepareStylePiece", () => {
  it("prepareStylePiece is stable", () => {
    const dress = item(
      "DRESS",
      {
        subtype: "wrap dress",
        colours: [col("teal", "#008080", 0.3), col("pink", "#e0218a", 0.7)],
        pattern: "floral",
        silhouette: "a_line",
      },
      { materials: ["60% Cotton", "Silk"] },
    );
    const a = prepareStylePiece(dress);
    const b = prepareStylePiece(dress);
    expect(a).toEqual(b);
    expect(a.item).toBe(dress);
    expect(a.harmony.main.colour.name).toBe("pink");
    expect(a.harmony.colours.map((c) => c.colour.name)).toEqual(["teal", "pink"]);
    expect(a.harmony.busy).toBe(true);
    expect(a.harmony.accent).toBe(false);
    expect(a.lightness).toBeCloseTo(0.603, 3);
    expect(a.fabric?.parts).toEqual([
      { material: "cotton", weight: 0.6 },
      { material: "silk", weight: 0.4 },
    ]);
    expect(a.rule).toEqual({ item: dress, fabric: a.fabric, lightness: a.lightness });
    expect(a.features).toEqual(featuresOf(dress));
  });

  it("takes the first of equal shares as the main colour, and survives missing or malformed colours", () => {
    const tie = prepareStylePiece(item("TOP", { colours: [col("green", "#2e7d32", 0.5), col("red", "#b71c1c", 0.5)] }));
    expect(tie.harmony.main.colour.name).toBe("green");

    const bad = prepareStylePiece(item("TOP", { colours: [col("navy", "bad-hex")] }));
    expect(bad.harmony.main.colour.name).toBe("navy");
    expect(bad.harmony.main.oklch).toBeNull();
    expect(bad.lightness).toBeNull();

    const none = prepareStylePiece(item("BOTTOM"));
    expect(none.harmony.colours).toEqual([]);
    expect(none.harmony.main.oklch).toBeNull();
    expect(none.harmony.main.neutral).toBe(false);
    expect(none.lightness).toBeNull();
    expect(none.fabric).toBeNull();

    const untagged: StyleItem = {
      id: "raw",
      slot: "FOOTWEAR",
      materials: ["Leather"],
      attributes: null,
      attributesSource: null,
      attributesConfirmed: {},
    };
    const raw = prepareStylePiece(untagged);
    expect(raw.harmony.busy).toBe(false);
    expect(raw.harmony.accent).toBe(true);
    expect(raw.harmony.colours).toEqual([]);
    expect(raw.features).toEqual(["fabric:leather"]);
  });

  it("marks footwear, bags and accessories as accents", () => {
    expect([...ACCENT_SLOTS].sort()).toEqual(
      ["BAG", "BANGLES", "EARRINGS", "FOOTWEAR", "HAIR_ACCESSORY", "NECKLACE", "WATCH"],
    );
    expect(prepareStylePiece(item("WATCH")).harmony.accent).toBe(true);
    expect(prepareStylePiece(item("LAYER")).harmony.accent).toBe(false);
    // The slot column wins; the tagged slot is the fallback.
    const fallback: StyleItem = { ...item("BAG"), slot: null };
    expect(prepareStylePiece(fallback).harmony.accent).toBe(true);
  });
});

describe("featuresOf", () => {
  const kurta: Partial<StyleAttributes> = {
    subtype: "kurta",
    colours: [col("green", "#2e7d32")],
    pattern: "solid",
    silhouette: "straight",
    length: "knee",
    rise: "high",
    sleeve: "elbow",
    neckline: "v",
    confidence: { silhouette: 0.5, length: 0.79, rise: 0.2 },
  };

  it("featuresOf skips untrusted shape fields", () => {
    const model = item("KURTA", kurta, { source: "MODEL", materials: ["Linen"] });
    expect(featuresOf(model)).toEqual(["colour:green", "pattern:solid", "fabric:linen", "sleeve:elbow", "neckline:v"]);

    const sure = item("KURTA", { ...kurta, confidence: { silhouette: 0.9, length: 0.8, rise: 0.95 } }, {
      source: "MODEL",
      materials: ["Linen"],
    });
    expect(featuresOf(sure)).toEqual([
      "colour:green",
      "pattern:solid",
      "fabric:linen",
      "silhouette:straight",
      "length:knee",
      "rise:high",
      "sleeve:elbow",
      "neckline:v",
    ]);

    const confirmed = item("KURTA", kurta, { source: "MODEL", confirmed: { silhouette: true }, materials: ["Linen"] });
    expect(featuresOf(confirmed)).toContain("silhouette:straight");
    expect(featuresOf(confirmed)).not.toContain("length:knee");

    // The user set it, so every shape field counts.
    expect(featuresOf(item("KURTA", kurta, { materials: ["Linen"] }))).toContain("rise:high");
  });

  it("reads greys, rule neutrals and named neutrals as neutral, and skips what it can't place", () => {
    expect(featuresOf(item("TOP", { colours: [col("grey", "#c0c0c0")] }))[0]).toBe("colour:neutral");
    expect(featuresOf(item("TOP", { colours: [col("denim", "#3b5a7a")] }))[0]).toBe("colour:neutral");
    expect(featuresOf(item("TOP", { colours: [col("black", "bad-hex")] }))[0]).toBe("colour:neutral");
    expect(featuresOf(item("TOP", { colours: [col("navy", "bad-hex")] }))).toEqual(["pattern:solid"]);
    expect(featuresOf(item("TOP", { colours: [] }))).toEqual(["pattern:solid"]);
    // An unknown lead material is unknown, never a guess.
    expect(featuresOf(item("TOP", {}, { materials: ["Mystery weave", "cotton"] }))).toEqual(["pattern:solid"]);
    expect(featuresOf(item("TOP", { neckline: "other", pattern: "check" }))).toEqual(["pattern:check", "neckline:other"]);
  });
});

describe("pieceTerms and lookTerms", () => {
  const wrap = prepareStylePiece(
    item("DRESS", { subtype: "wrap dress", colours: [col("red", "#b71c1c")] }, { materials: ["linen"] }),
  );
  const shoes = prepareStylePiece(item("FOOTWEAR", { colours: [col("black", "#111111")] }));
  const hot = day({ highC: 34 });

  it("with no profile, likes and proportion are zero while palette and fabric still apply (§5.1)", () => {
    const c = ctx(WARM);
    const t = pieceTerms(wrap, hot, c);
    expect(t.likes).toEqual(ZERO_TERM);
    expect(t.palette).toEqual({ score: paletteScore(wrap.item, WARM), reasons: [] });
    expect(t.palette.score).toBe(1);
    expect(t.fabric).toEqual(fabricTerm(wrap.fabric, hot, null));
    expect(t.fabric.score).toBeGreaterThan(0);
    expect(t.fabric.reasons.map((r) => r.id)).toEqual(["BREATHABLE_HEAT"]);

    const l = lookTerms([wrap, shoes], hot, c);
    expect(l.likes.score).toBe(0);
    expect(l.proportion).toEqual(ZERO_TERM);
  });

  it("with only learned preferences, likes comes from them alone and proportion stays zero", () => {
    const learnedOnly = profile({ learned: [pref("work", "colour:red", 0.8)] });
    const c = ctx(WARM, learnedOnly);
    expect(pieceTerms(wrap, hot, c).likes).toEqual({ score: 0.8 * 0.3, reasons: [] });
    expect(pieceTerms(wrap, day({ dayType: "casual" }), c).likes.score).toBe(0);
    // A preference with too little support doesn't count.
    expect(pieceTerms(wrap, hot, ctx(WARM, profile({ learned: [pref("work", "colour:red", 0.8, 2)] }))).likes.score).toBe(0);
    expect(lookTerms([wrap, shoes], hot, c)).toEqual({ likes: ZERO_TERM, proportion: ZERO_TERM });
  });

  it("adds the like rows to the learned score and clamps the sum", () => {
    const top = prepareStylePiece(
      item("TOP", { subtype: "wrap top", sleeve: "elbow", silhouette: "fitted" }, { materials: ["denim"] }),
    );
    const p = profile({
      likes: likes({ define: ["waist"], cover: ["arms"], sit: "fitted" }),
      learned: [pref("work", "pattern:solid", 1), pref("work", "sleeve:elbow", 1)],
    });
    const t = pieceTerms(top, hot, ctx(EMPTY, p));
    expect(t.likes.score).toBe(1);
    expect(t.likes.reasons.map((r) => r.id)).toEqual(["DEFINES_WAIST", "COVERS", "CLEAN_LINE"]);
    // The rule rows are already capped at 1 by the rule set, so a learned dislike still pulls the sum down.
    expect(pieceTerms(top, hot, ctx(EMPTY, { ...p, learned: [pref("work", "pattern:solid", -1)] })).likes.score).toBeCloseTo(0.7, 10);
    const lowLike = profile({ likes: likes({ define: ["waist"] }), learned: [pref("work", "pattern:solid", -1)] });
    expect(pieceTerms(top, hot, ctx(EMPTY, lowLike)).likes.score).toBeCloseTo(0.5 - 0.3, 10);
  });

  it("averages the piece-scope proportion rows over the ruled pieces and adds the look-scope rows", () => {
    const straight = prepareStylePiece(item("DRESS", { subtype: "shift dress", silhouette: "straight" }));
    const top = prepareStylePiece(item("TOP", { subtype: "shirt", silhouette: "straight", neckline: "v" }));
    const plain = prepareStylePiece(item("BOTTOM", { subtype: "trousers" }));
    const flare = prepareStylePiece(item("BOTTOM", { subtype: "palazzo", silhouette: "a_line" }));
    const c = ctx(EMPTY, profile({ proportions: props({ waist: bucket("straight", 0.7) }) }));

    // The shoes aren't ruled, so they don't dilute the average.
    const alone = lookTerms([straight, shoes], hot, c);
    expect(alone.proportion.score).toBeCloseTo(0.5 * 0.7, 10);
    expect(alone.proportion.reasons).toEqual([{ id: "SKIMS_WAIST", strength: 0.35, params: { piece: "dress" } }]);

    const pair = lookTerms([top, plain, shoes], hot, c);
    expect(pair.proportion.score).toBeCloseTo(0.35 / 2, 10);
    expect(pair.proportion.reasons[0]?.strength).toBeCloseTo(0.175, 10);

    const both = ctx(EMPTY, profile({ proportions: props({ waist: bucket("straight", 0.7), balance: bucket("top_wider") }) }));
    const flared = lookTerms([top, flare], hot, both);
    // SKIMS_WAIST on both pieces (0.35 each, averaged) plus VOLUME_BELOW for the look (0.5).
    expect(flared.proportion.score).toBeCloseTo(0.35 + 0.5, 10);
    expect(flared.proportion.reasons.map((r) => r.id)).toEqual(["SKIMS_WAIST", "SKIMS_WAIST", "VOLUME_BELOW"]);

    const clamped = ctx(
      EMPTY,
      profile({ proportions: props({ waist: bucket("straight"), balance: bucket("top_wider"), torso: bucket("longer_legs") }) }),
    );
    const long = prepareStylePiece(item("TOP", { subtype: "tunic", silhouette: "straight", neckline: "v", length: "knee" }));
    expect(lookTerms([long, flare], hot, clamped).proportion.score).toBe(1);
    expect(lookTerms([], hot, clamped)).toEqual({ likes: ZERO_TERM, proportion: ZERO_TERM });
  });

  it("puts the look-scope like rows in the look's likes", () => {
    const tee = prepareStylePiece(item("TOP", { subtype: "tee", sleeve: "sleeveless" }));
    const jacket = prepareStylePiece(item("LAYER", { subtype: "jacket", sleeve: "long" }));
    const c = ctx(EMPTY, profile({ likes: likes({ cover: ["arms"] }) }));
    expect(lookTerms([tee, jacket], hot, c).likes).toEqual({
      score: 0.5,
      reasons: [{ id: "COVERS", strength: 0.5, params: { zone: "arms", sleeve: "long" } }],
    });
  });

  it("likes beat proportions end to end", () => {
    const shift = prepareStylePiece(item("DRESS", { subtype: "shift dress", silhouette: "straight" }));
    const wrapDress = prepareStylePiece(item("DRESS", { subtype: "wrap dress" }));
    const wrapLook = [wrapDress, shoes];
    const shiftLook = [shift, shoes];
    const d = day();

    // The straight waist alone prefers the dress that skims the waist.
    const proportionsOnly = ctx(EMPTY, profile({ proportions: props({ waist: bucket("straight") }) }));
    expect(lookTerms(shiftLook, d, proportionsOnly).proportion.score).toBe(0.5);
    expect(lookScore(shiftLook, d, proportionsOnly)).toBeGreaterThan(lookScore(wrapLook, d, proportionsOnly));

    // The like to define the waist wins: the skimming rule gives way, and the wrap leads.
    const liked = ctx(EMPTY, profile({ likes: likes({ define: ["waist"] }), proportions: props({ waist: bucket("straight") }) }));
    expect(lookTerms(shiftLook, d, liked).proportion).toEqual(ZERO_TERM);
    expect(pieceTerms(wrapDress, d, liked).likes.score).toBe(0.5);
    expect(lookScore(wrapLook, d, liked)).toBeGreaterThan(lookScore(shiftLook, d, liked));
    expect(lookScore(shiftLook, d, liked)).toBe(0);

    // When they agree, both add.
    const agree = ctx(EMPTY, profile({ likes: likes({ define: ["waist"] }), proportions: props({ waist: bucket("defined") }) }));
    expect(lookScore(wrapLook, d, agree)).toBeCloseTo(1 * 0.5 + 0.5 * 0.5, 10);
  });

  it("recomputes when the palette or the profile changes", () => {
    const red = prepareStylePiece(item("TOP", { subtype: "wrap top", colours: [col("red", "#b71c1c")] }));
    expect(pieceTerms(red, hot, ctx(WARM)).palette.score).toBe(paletteScore(red.item, WARM));
    expect(pieceTerms(red, hot, ctx(COOL)).palette.score).toBe(paletteScore(red.item, COOL));
    expect(pieceTerms(red, hot, ctx(EMPTY)).palette).toEqual(ZERO_TERM);
    expect(pieceTerms(red, hot, ctx(WARM)).palette.score).toBe(paletteScore(red.item, WARM));

    const defineWaist = profile({ likes: likes({ define: ["waist"] }) });
    expect(pieceTerms(red, hot, ctx(EMPTY, defineWaist)).likes.score).toBe(0.5);
    expect(pieceTerms(red, hot, ctx(EMPTY)).likes).toEqual(ZERO_TERM);
    expect(pieceTerms(red, hot, ctx(EMPTY, { ...defineWaist, likes: likes({ sit: "relaxed" }) })).likes.score).toBe(0);

    // A look's rule terms are kept per look and profile, and the order of its pieces is part of the look.
    const tee = prepareStylePiece(item("TOP", { subtype: "tee", neckline: "v" }));
    const jacket = prepareStylePiece(item("LAYER", { subtype: "jacket", sleeve: "long" }));
    const flare = prepareStylePiece(item("BOTTOM", { subtype: "palazzo" }));
    const arms = ctx(EMPTY, profile({ likes: likes({ cover: ["arms"] }) }));
    const balance = ctx(EMPTY, profile({ proportions: props({ balance: bucket("top_wider") }) }));
    expect(lookTerms([tee, jacket, flare], hot, arms).likes.score).toBe(0.5);
    expect(lookTerms([tee, jacket, flare], hot, balance)).toEqual({
      likes: ZERO_TERM,
      proportion: { score: 0.5, reasons: [{ id: "VOLUME_BELOW", strength: 0.5, params: { piece: "palazzo" } }] },
    });
    expect(lookTerms([tee, jacket, flare], hot, balance)).toBe(lookTerms([tee, jacket, flare], hot, balance));
    expect(lookTerms([flare, tee], hot, balance).proportion.score).toBe(0.5);
    expect(lookTerms([tee, jacket, flare], hot, arms).likes.score).toBe(0.5);
    expect(lookTerms([tee, jacket], hot, balance)).toEqual({ likes: ZERO_TERM, proportion: ZERO_TERM });
  });
});

describe("metals", () => {
  const d = day();
  const piece = (slot: ItemSlot, ...colours: StyleColour[]) => prepareStylePiece(item(slot, { colours }));
  const shift = (p: StylePiece, palette: Palette) => pieceTerms(p, d, ctx(palette)).palette.score - paletteScore(p.item, palette);

  it("gold leans warm and silver leans cool, on jewellery only", () => {
    expect([...METAL_SLOTS].sort()).toEqual(["BANGLES", "EARRINGS", "NECKLACE", "WATCH"]);
    const gold = piece("EARRINGS", col("Antique Gold", "#d4a017"));
    const silver = piece("NECKLACE", col("silver", "#c0c0c0"));
    expect(shift(gold, WARM)).toBeCloseTo(METAL_WEIGHT, 10);
    expect(shift(gold, COOL)).toBeCloseTo(-METAL_WEIGHT, 10);
    expect(shift(silver, WARM)).toBeCloseTo(-METAL_WEIGHT, 10);
    expect(shift(silver, COOL)).toBeCloseTo(METAL_WEIGHT, 10);
    expect(shift(gold, MIXED)).toBe(0);
    expect(shift(gold, { ...WARM, lean: null })).toBe(0);
    expect(shift(piece("BAG", col("gold", "#d4a017")), WARM)).toBe(0);
    expect(shift(piece("BANGLES", col("rose-gold", "#d4a017"), col("silver", "#c0c0c0")), WARM)).toBe(0);
    // A whole word only: marigold is a colour, not a metal.
    expect(shift(piece("WATCH", col("marigold", "#d4a017")), WARM)).toBe(0);
    expect(shift(piece("WATCH", col("golden", "#d4a017")), WARM)).toBeCloseTo(METAL_WEIGHT, 10);
  });

  it("keeps the palette term within −1 and 1", () => {
    const own: Palette = { ...WARM, swatches: [{ key: "yellow-mid", family: "yellow", band: "mid", hex: "#d4a017", weight: 1 }] };
    expect(pieceTerms(piece("EARRINGS", col("gold", "#d4a017")), d, ctx(own)).palette.score).toBe(1);
  });
});

describe("weighted", () => {
  const t = (score: number): Term => ({ score, reasons: [] });

  it("weighted applies multipliers", () => {
    expect(STYLE_WEIGHTS).toEqual({ likes: 1, proportion: 0.5, palette: 0.5, fabric: 0.6 });
    const terms = { likes: t(0.5), proportion: t(-0.4), palette: t(1), fabric: t(0.25) };
    expect(weighted(terms)).toBeCloseTo(0.5 - 0.2 + 0.5 + 0.15, 10);
    expect(weighted(terms, { palette: 2, fabric: 0.5 })).toBeCloseTo(0.5 - 0.2 + 1 + 0.075, 10);
    expect(weighted(terms, { likes: 0 })).toBeCloseTo(-0.2 + 0.5 + 0.15, 10);
    expect(weighted({})).toBe(0);
    expect(weighted({ likes: t(0.5) })).toBe(0.5);
  });

  it("ignores a score or multiplier that isn't a finite number", () => {
    expect(weighted({ likes: t(Number.NaN), fabric: t(0.5) })).toBeCloseTo(0.3, 10);
    expect(weighted({ likes: t(0.5) }, { likes: Number.POSITIVE_INFINITY })).toBe(0.5);
  });
});

describe("pairHarmony", () => {
  const pink = (a: Partial<StyleAttributes> = {}) => prepareStylePiece(item("TOP", { colours: [col("magenta", "#e0218a")], ...a }));
  const orange = (a: Partial<StyleAttributes> = {}) => prepareStylePiece(item("BOTTOM", { colours: [col("orange", "#ff8c00")], ...a }));
  const festiveFeel: Partial<StyleAttributes> = { formality: FESTIVE_MIN_FORMALITY, feel: ["festive"] as Feel[] };

  it("pairHarmony festive context", () => {
    expect(pairHarmony(pink(), orange(), day())).toBe(-0.6);
    expect(pairHarmony(pink(), orange(), day({ festive: true, formality: 4 }))).toBe(0.2);
    expect(pairHarmony(pink(), orange(), day({ festive: true, formality: 3 }))).toBe(-0.6);
    expect(pairHarmony(pink(), orange(), day({ formality: 5 }))).toBe(-0.6);
    // Both pieces formal and festive make the pair festive on any day.
    expect(pairHarmony(pink(festiveFeel), orange(festiveFeel), day())).toBe(0.2);
    expect(pairHarmony(pink(festiveFeel), orange(), day())).toBe(-0.6);
    expect(pairHarmony(pink({ ...festiveFeel, formality: 3 }), orange(festiveFeel), day())).toBe(-0.6);
    const a = pink();
    const b = orange();
    expect(pairHarmony(a, b, day())).toBe(harmony(a.harmony, b.harmony, false));
  });

  it("falls back to names when a hex is missing", () => {
    const light = prepareStylePiece(item("TOP", { colours: [col("light blue", "bad-hex")] }));
    const navy = prepareStylePiece(item("BOTTOM", { colours: [col("navy blue", "")] }));
    expect(pairHarmony(light, navy, day())).toBe(0.4);
    expect(pairHarmony(light, prepareStylePiece(item("BOTTOM")), day())).toBe(0);
  });
});

// ── Property test and budget ─────────────────────────────────────────────────

/** A small seeded generator (Numerical Recipes LCG), so the property test is repeatable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
const maybe = <T>(r: () => number, list: readonly T[]): T | undefined => (r() < 0.5 ? pick(r, list) : undefined);

const GEN = {
  slots: [
    "TOP", "BOTTOM", "DRESS", "KURTA", "SAREE", "BLOUSE", "LAYER", "DUPATTA", "FOOTWEAR", "BAG",
    "EARRINGS", "NECKLACE", "WATCH", "COORD_TOP", "COORD_BOTTOM", "JUMPSUIT",
  ] as ItemSlot[],
  colours: [
    col("magenta", "#e0218a"), col("orange", "#ff8c00"), col("gold", "#d4a017"), col("silver", "#c0c0c0"),
    col("teal", "#008080"), col("navy", "#1f3a93"), col("green", "#2e7d32"), col("red", "#b71c1c"),
    col("black", "#111111"), col("white", "#ffffff"), col("denim", "#3b5a7a"), col("cream", "bad-hex"),
    col("sage", "#bcb88a"), col("plum", ""),
  ],
  patterns: ["solid", "solid", "stripe", "check", "floral", "print", "embroidered"] as Pattern[],
  subtypes: ["wrap dress", "shift dress", "kurta", "anarkali", "shirt", "tee", "palazzo", "jeans", "belted top", "saree"],
  silhouettes: ["bodycon", "fitted", "a_line", "straight", "relaxed", "oversized", "flowy"] as const,
  waist: ["bodycon", "fitted", "ruched", "defined", "relaxed", "unstructured"] as const,
  lengths: ["cropped", "waist", "hip", "thigh", "knee", "calf", "ankle", "floor"] as const,
  rises: ["high", "mid", "low"] as const,
  sleeves: ["sleeveless", "cap", "short", "elbow", "three_quarter", "long"] as const,
  necklines: ["scoop", "v", "crew", "collar", "off_shoulder", "high"] as const,
  materials: ["cotton", "60% Cotton", "linen", "silk", "satin", "polyester", "jersey", "velvet", "denim", "art silk", "Mystery", ""],
  feels: ["relaxed", "polished", "festive", "minimal"] as Feel[],
  defines: ["waist", "shoulders", "legs"] as DefineLike[],
  covers: ["arms", "midriff", "legs", "back"] as CoverLike[],
  dayTypes: ["work", "casual", "evening", "festive", "active"] as DayType[],
};

function randomItem(r: () => number, i: number): StyleItem {
  const slot = pick(r, GEN.slots);
  const n = Math.floor(r() * 3);
  const colours = Array.from({ length: n }, () => ({ ...pick(r, GEN.colours), share: Math.round(r() * 10) / 10 }));
  const trust = r();
  const attributes: StyleAttributes = {
    ...BASE,
    slot,
    subtype: pick(r, GEN.subtypes),
    colours,
    pattern: pick(r, GEN.patterns),
    formality: 1 + Math.floor(r() * 5),
    feel: r() < 0.3 ? [pick(r, GEN.feels)] : [],
    silhouette: maybe(r, GEN.silhouettes),
    fit: { waist: maybe(r, GEN.waist) },
    length: maybe(r, GEN.lengths),
    rise: maybe(r, GEN.rises),
    sleeve: maybe(r, GEN.sleeves),
    neckline: maybe(r, GEN.necklines),
    coverage: { midriff: maybe(r, ["covered", "bare"] as const), legs: maybe(r, ["above_knee", "ankle"] as const) },
    volumeAt: r() < 0.2 ? ["shoulders"] : undefined,
    eveningOk: r() < 0.3,
    confidence: { silhouette: trust, fit: trust, length: trust, rise: trust, coverage: trust, volumeAt: trust },
  };
  const materials = r() < 0.8 ? [pick(r, GEN.materials), ...(r() < 0.4 ? [pick(r, GEN.materials)] : [])] : [];
  return {
    id: `item-${i}`,
    slot: r() < 0.9 ? slot : null,
    materials,
    attributes: r() < 0.95 ? { ...attributes, materials } : null,
    attributesSource: r() < 0.3 ? "USER" : "MODEL",
    attributesConfirmed: r() < 0.2 ? { fit: true } : {},
  };
}

function randomDay(r: () => number, i: number): StyleDay {
  return {
    date: `2026-11-0${i + 1}`,
    dayType: pick(r, GEN.dayTypes),
    highC: r() < 0.9 ? 14 + Math.round(r() * 26) : null,
    rainChance: r() < 0.9 ? Math.round(r() * 10) / 10 : null,
    humidity: r() < 0.5 ? Math.round(r() * 10) / 10 : null,
    longDay: r() < 0.3,
    hours: r() < 0.5 ? 8 + Math.floor(r() * 4) : null,
    formality: 1 + Math.floor(r() * 5),
    festive: r() < 0.2,
  };
}

function randomProfile(r: () => number, pool: readonly StyleItem[]): StyleProfileInput {
  const features = [...new Set(pool.flatMap(featuresOf))].sort();
  return {
    version: 1,
    likes: {
      define: GEN.defines.filter(() => r() < 0.4),
      cover: GEN.covers.filter(() => r() < 0.4),
      sit: pick(r, ["relaxed", "fitted", "either"] as const),
    },
    proportions: {
      waist: bucket(pick(r, ["defined", "moderate", "straight"] as const), pick(r, [1, 0.7, 0.35])),
      balance: bucket(pick(r, ["top_wider", "balanced", "bottom_wider"] as const), pick(r, [1, 0.7])),
      torso: r() < 0.5 ? bucket(pick(r, ["longer_torso", "balanced", "longer_legs"] as const), 0.7) : null,
    },
    learned: Array.from({ length: 40 }, () =>
      pref(pick(r, GEN.dayTypes), pick(r, features), Math.round((r() * 2 - 1) * 10) / 10, 2 + Math.floor(r() * 4)),
    ),
  };
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const WEIGHT_SUM = STYLE_WEIGHTS.likes + STYLE_WEIGHTS.proportion + STYLE_WEIGHTS.palette + STYLE_WEIGHTS.fabric;

describe("properties", () => {
  it("rank never remove", () => {
    expect(WEIGHT_SUM).toBeCloseTo(2.6, 10);
    const r = lcg(20261026);
    const pool = Array.from({ length: 60 }, (_, i) => randomItem(r, i));
    const metrics: StyleMetric[] = pool.map((it) => ({ itemId: it.id, wears180: Math.floor(r() * 12) }));
    const looks = Array.from({ length: 200 }, (_, i) => {
      const size = 2 + Math.floor(r() * 4);
      const members = new Set<number>();
      while (members.size < size) members.add(Math.floor(r() * pool.length));
      return { id: `look-${String(i).padStart(3, "0")}`, items: [...members].map((k) => pool[k]!) };
    });
    const days = Array.from({ length: 7 }, (_, i) => randomDay(r, i));
    const before = JSON.stringify({ pool, looks });

    const palette = learnPalette(pool, metrics);
    const contexts = [ctx(palette), ctx(palette, randomProfile(r, pool)), ctx(EMPTY, randomProfile(r, pool))];
    const inRange = (x: number, bound: number) => {
      expect(Number.isFinite(x)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(bound + 1e-12);
    };

    const totals: number[][] = [];
    for (const c of contexts) {
      const scores: number[] = [];
      for (const d of days) {
        const ranked = looks
          .map((look) => {
            const pieces = look.items.map(prepareStylePiece);
            for (const p of pieces) {
              const t = pieceTerms(p, d, c);
              for (const term of [t.likes, t.palette, t.fabric]) inRange(term.score, 1);
              inRange(weighted(t), WEIGHT_SUM);
            }
            const lt = lookTerms(pieces, d, c);
            inRange(lt.likes.score, 1);
            inRange(lt.proportion.score, 1);
            inRange(weighted(lt), WEIGHT_SUM);
            return { id: look.id, score: lookScore(pieces, d, c) };
          })
          .sort((a, b) => b.score - a.score || byId(a, b));
        // Same looks in, same looks out: style only reorders them.
        expect(ranked.map((x) => x.id).sort()).toEqual(looks.map((l) => l.id));
        scores.push(...[...ranked].sort(byId).map((x) => x.score));
      }
      totals.push(scores);
    }
    expect(JSON.stringify({ pool, looks })).toBe(before);
    // The profile changes scores, never membership.
    expect(totals[1]!.some((s, i) => s !== totals[0]![i])).toBe(true);
  });
});

describe("budget", () => {
  it("score budget", () => {
    const r = lcg(300);
    const pool = Array.from({ length: 300 }, (_, i) => randomItem(r, i));
    const metrics: StyleMetric[] = pool.map((it) => ({ itemId: it.id, wears180: Math.floor(r() * 12) }));
    const looks = Array.from({ length: 2000 }, () => Array.from({ length: 3 + Math.floor(r() * 2) }, () => Math.floor(r() * 300)));
    const days = Array.from({ length: 7 }, (_, i) => randomDay(r, i));
    const c = ctx(learnPalette(pool, metrics), randomProfile(r, pool));

    const run = (): number => {
      const pieces = pool.map(prepareStylePiece);
      let total = 0;
      for (const d of days) {
        const unary = pieces.map((p) => weighted(pieceTerms(p, d, c)));
        for (const look of looks) {
          const ps = look.map((k) => pieces[k]!);
          total += weighted(lookTerms(ps, d, c));
          for (const k of look) total += unary[k]!;
          for (let j = 1; j < ps.length; j++) total += pairHarmony(ps[0]!, ps[j]!, d);
        }
      }
      return total;
    };

    expect(Number.isFinite(run())).toBe(true);
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      run();
      best = Math.min(best, performance.now() - start);
    }
    console.info(`score budget: 300 pieces, 7 days x 2000 looks in ${best.toFixed(1)} ms`);
    expect(best).toBeLessThan(50);
  });
});
