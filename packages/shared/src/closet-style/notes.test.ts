import { describe, expect, it } from "vitest";
import {
  ALL_TEMPLATE_SAMPLES,
  DAY_TYPE_WORDS,
  GAP_FEATURE_PHRASES,
  GAP_WHY_TEMPLATES,
  SLOT_NOUNS,
  STYLE_REASON_TEMPLATES,
  STYLE_WHY_MAX_REASONS,
  gapWhat,
  learnedLine,
  paletteConfidenceLine,
  paletteLeanLine,
  styleWhy,
} from "./notes.js";
import type { FeaturePref, GapCandidate, Palette, StyleReason } from "./types.js";

const REASON_IDS = [
  "DEFINES_WAIST",
  "SKIMS_WAIST",
  "VOLUME_BELOW",
  "INTEREST_ABOVE",
  "HIGH_RISE",
  "LONG_TOP",
  "COVERS",
  "EASY_FIT",
  "CLEAN_LINE",
  "SHOWS_SHOULDERS",
  "SHOWS_LEGS",
  "BREATHABLE_HEAT",
  "LOW_CREASE_LONG_DAY",
  "DRIES_FAST",
] as const;

const GAP_WHY_IDS = [
  "OCCASION_NO_LOOK",
  "SLOT_MISSING",
  "RAIN_FOOTWEAR",
  "LAYER_COOL_MORNINGS",
  "BLOUSE_FOR_SAREES",
  "EVENING_IN_COLOURS",
  "NEUTRAL_BOTTOM_FOR_PRINTS",
  "LIKE_UNMET",
] as const;

const R = STYLE_REASON_TEMPLATES;
const G = GAP_WHY_TEMPLATES;

const palette = (over: Partial<Palette> = {}): Palette => ({
  swatches: [],
  lean: { temperature: "cool", chroma: "soft", depth: "mid" },
  neutrals: ["black", "cream"],
  confidence: "low",
  basis: "owned",
  pieceCount: 14,
  ...over,
});

const candidate = (over: Partial<GapCandidate>): GapCandidate => ({
  slot: "TOP",
  family: "neutral",
  band: null,
  neutral: null,
  feature: null,
  ...over,
});

const learned = (over: Partial<FeaturePref>): FeaturePref => ({
  dayType: "work",
  feature: "sleeve:sleeveless",
  value: -0.6,
  support: 4,
  ...over,
});

describe("style reason templates", () => {
  it("every reason id has a template", () => {
    expect(Object.keys(R).sort()).toEqual([...REASON_IDS].sort());
    for (const id of REASON_IDS) {
      const line = R[id]({});
      expect(line.length).toBeGreaterThan(0);
      expect(line.endsWith(".")).toBe(true);
    }
  });

  it("renders the spec's lines exactly", () => {
    expect(R.DEFINES_WAIST({ piece: "wrap", how: "ties" })).toBe("The wrap ties at the waist.");
    expect(R.DEFINES_WAIST({ piece: "dress", how: "shaped" })).toBe("The dress is shaped at the waist.");
    expect(R.BREATHABLE_HEAT({ materials: "Linen and cotton", highC: 34 })).toBe("Linen and cotton for a 34° day.");
    expect(R.LOW_CREASE_LONG_DAY({ material: "crepe", hours: 9 })).toBe("Crepe won't crease over nine hours.");
    expect(R.DRIES_FAST({ avoided: "denim", material: "nylon" })).toBe("Denim stays home; this dries fast.");
    expect(R.SKIMS_WAIST({ piece: "kurta" })).toBe("It falls straight from the shoulder.");
    expect(R.VOLUME_BELOW({ piece: "skirt" })).toBe("The flare at the hem balances the look.");
    expect(R.INTEREST_ABOVE({ detail: "neckline" })).toBe("The detail sits at the neckline.");
    expect(R.HIGH_RISE({ over: "top" })).toBe("A high rise under a short top.");
    expect(R.HIGH_RISE({ over: "kurta" })).toBe("A high rise under the kurta.");
    expect(R.LONG_TOP({ via: "top", top: "kurta" })).toBe("The kurta falls past the hip.");
    expect(R.LONG_TOP({ via: "rise" })).toBe("A mid rise, sitting below the waist.");
    expect(R.EASY_FIT({ material: "cotton" })).toBe("Loose through the body, in a soft cotton.");
    expect(R.EASY_FIT({})).toBe("Loose through the body.");
    expect(R.CLEAN_LINE({ material: "crepe" })).toBe("A close fit in a fabric that holds its shape.");
    expect(R.SHOWS_SHOULDERS({ neckline: "off_shoulder" })).toBe("The off-shoulder neckline opens at the shoulders.");
    expect(R.SHOWS_LEGS({ length: "knee" })).toBe("A knee-length hem.");
  });

  it("COVERS names the zone", () => {
    expect(R.COVERS({ zone: "arms", sleeve: "elbow" })).toBe("Elbow sleeves.");
    expect(R.COVERS({ zone: "arms", sleeve: "three_quarter" })).toBe("Three-quarter sleeves.");
    expect(R.COVERS({ zone: "arms", sleeve: "long" })).toBe("Long sleeves.");
    expect(R.COVERS({ zone: "arms" })).toBe("Covered over the arms.");
    expect(R.COVERS({ zone: "midriff" })).toBe("Covered through the middle.");
    expect(R.COVERS({ zone: "legs" })).toBe("It runs to the ankle.");
    expect(R.COVERS({ zone: "back" })).toBe("A high back.");
    expect(R.COVERS({})).toBe("Covered where you asked.");
  });

  it("fabric reasons fall back when a param is missing", () => {
    expect(R.LOW_CREASE_LONG_DAY({ material: "crepe" })).toBe("Crepe won't crease over a long day.");
    expect(R.LOW_CREASE_LONG_DAY({ material: "crepe", hours: 12 })).toBe("Crepe won't crease over 12 hours.");
    expect(R.LOW_CREASE_LONG_DAY({ material: "crepe", hours: 1 })).toBe("Crepe won't crease over one hour.");
    expect(R.LOW_CREASE_LONG_DAY({ material: "crepe", hours: "10" })).toBe("Crepe won't crease over ten hours.");
    expect(R.LOW_CREASE_LONG_DAY({ hours: 9 })).toBe("It won't crease over nine hours.");
    expect(R.DRIES_FAST({ material: "nylon" })).toBe("Nylon dries fast.");
    expect(R.DRIES_FAST({ avoided: "Denim" })).toBe("Denim stays home; this dries fast.");
    expect(R.DRIES_FAST({ avoided: "silk", material: "polyester" })).toBe("Polyester dries fast.");
    expect(R.DRIES_FAST({})).toBe("It dries fast.");
    expect(R.BREATHABLE_HEAT({ materials: "linen", highC: 33.6 })).toBe("Linen for a 34° day.");
    expect(R.BREATHABLE_HEAT({ materials: "Linen" })).toBe("Linen for a hot day.");
    expect(R.BREATHABLE_HEAT({ highC: 34 })).toBe("A breathable fabric for a 34° day.");
    expect(R.BREATHABLE_HEAT({ materials: "Cotton", highC: 18 })).toBe("Cotton for an 18° day.");
  });

  it("never renders a raw value", () => {
    expect(R.DEFINES_WAIST({})).toBe("It is shaped at the waist.");
    expect(R.HIGH_RISE({})).toBe("The rise sits high, at the waist.");
    expect(R.INTEREST_ABOVE({ detail: "sleeves" })).toBe("The detail sits at the sleeves.");
    expect(R.INTEREST_ABOVE({ detail: "embroidery" })).toBe("The embroidered top carries the detail.");
    expect(R.INTEREST_ABOVE({})).toBe("The detail sits up top.");
    expect(R.LONG_TOP({})).toBe("It balances top and bottom.");
    expect(R.LONG_TOP({ top: "tunic" })).toBe("The tunic falls past the hip.");
    expect(R.SHOWS_SHOULDERS({ neckline: "v" })).toBe("The V neckline opens at the shoulders.");
    expect(R.SHOWS_SHOULDERS({ neckline: "other" })).toBe("The neckline opens at the shoulders.");
    expect(R.SHOWS_SHOULDERS({})).toBe("The neckline opens at the shoulders.");
    expect(R.SHOWS_LEGS({ length: "ankle" })).toBe("An ankle-length hem.");
    expect(R.SHOWS_LEGS({ length: "above_knee" })).toBe("A hem above the knee.");
    expect(R.SHOWS_LEGS({ length: "cropped" })).toBe("A cropped hem.");
    expect(R.SHOWS_LEGS({})).toBe("A shorter hem.");
    expect(R.EASY_FIT({ material: "faux_leather" })).toBe("Loose through the body, in a soft faux leather.");
    expect(R.EASY_FIT({ material: "  " })).toBe("Loose through the body.");
    expect(R.LOW_CREASE_LONG_DAY({ material: "stretch_blend", hours: Number.NaN })).toBe(
      "Stretch blend won't crease over a long day.",
    );
  });
});

describe("styleWhy", () => {
  const reason = (id: StyleReason["id"], strength: number, params: StyleReason["params"] = {}): StyleReason => ({
    id,
    strength,
    params,
  });

  it("styleWhy picks the two strongest, deduped", () => {
    const reasons = [
      reason("DRIES_FAST", 0.2, { material: "nylon" }),
      reason("DEFINES_WAIST", 0.55, { piece: "dress" }),
      reason("BREATHABLE_HEAT", 0.5, { materials: "Linen and cotton", highC: 34 }),
      reason("DEFINES_WAIST", 0.6, { piece: "wrap", how: "ties" }),
    ];
    expect(STYLE_WHY_MAX_REASONS).toBe(2);
    expect(styleWhy(reasons)).toBe("The wrap ties at the waist. Linen and cotton for a 34° day.");
    expect(styleWhy([...reasons].reverse())).toBe(styleWhy(reasons));
  });

  it("breaks strength ties by id", () => {
    const reasons = [
      reason("HIGH_RISE", 0.5),
      reason("DRIES_FAST", 0.5, { material: "nylon" }),
      reason("CLEAN_LINE", 0.5),
    ];
    expect(styleWhy(reasons)).toBe("A close fit in a fabric that holds its shape. Nylon dries fast.");
  });

  it("returns one line for one reason, and null for none", () => {
    expect(styleWhy([reason("HIGH_RISE", 0.3)])).toBe("The rise sits high, at the waist.");
    expect(styleWhy([])).toBeNull();
  });

  it("skips an id it has no template for", () => {
    const unknown = { id: "toString", strength: 9, params: {} } as unknown as StyleReason;
    expect(styleWhy([unknown, reason("HIGH_RISE", 0.1)])).toBe("The rise sits high, at the waist.");
    expect(styleWhy([unknown])).toBeNull();
  });

  it("ranks a reason with no usable strength last", () => {
    const reasons = [reason("HIGH_RISE", Number.NaN), reason("CLEAN_LINE", 0.1), reason("DRIES_FAST", 0.05)];
    expect(styleWhy(reasons)).toBe("A close fit in a fabric that holds its shape. It dries fast.");
  });
});

describe("gap words", () => {
  it("every slot has a noun, as the plan names them", () => {
    expect(Object.keys(SLOT_NOUNS)).toHaveLength(21);
    expect(SLOT_NOUNS).toMatchObject({
      TOP: "top",
      BOTTOM: "bottom",
      DRESS: "dress",
      KURTA: "kurta",
      BLOUSE: "blouse",
      LAYER: "layer",
      FOOTWEAR: "pair of shoes",
      BAG: "bag",
      DUPATTA: "dupatta",
      SAREE: "saree",
    });
    expect(GAP_FEATURE_PHRASES).toEqual({
      defines_waist: "that ties at the waist",
      rain_ok: "for rain",
      evening: "for evenings",
      festive: "for festive days",
      layer_warm: "for cool mornings",
      covers_arms: "with elbow sleeves",
      covers_legs: "that runs to the ankle",
      covers_midriff: "covered through the middle",
      covers_back: "with a high back",
      relaxed: "with an easy fit",
      fitted: "with a close fit",
    });
    expect(DAY_TYPE_WORDS).toEqual({ work: "office", casual: "casual", evening: "evening", festive: "festive", active: "gym" });
  });

  it("gapWhat names the colour, the slot and the feature", () => {
    expect(gapWhat(candidate({ slot: "KURTA", family: "teal", band: "deep", feature: "defines_waist" }))).toBe(
      "a deep teal kurta that ties at the waist",
    );
    expect(gapWhat(candidate({ slot: "BOTTOM", neutral: "black" }))).toBe("a black bottom");
    expect(gapWhat(candidate({ slot: "TOP", family: "green", band: "mid", feature: "covers_arms" }))).toBe(
      "a green top with elbow sleeves",
    );
    expect(gapWhat(candidate({ slot: "LAYER", family: "green", neutral: "olive", feature: "layer_warm" }))).toBe(
      "an olive layer for cool mornings",
    );
    expect(gapWhat(candidate({ slot: "DRESS", family: "orange", band: "light", feature: "evening" }))).toBe(
      "a light orange dress for evenings",
    );
    expect(gapWhat(candidate({ slot: "BLOUSE", family: "pink", feature: "festive" }))).toBe(
      "a pink blouse for festive days",
    );
    expect(gapWhat(candidate({ slot: "BOTTOM", family: "orange" }))).toBe("an orange bottom");
    expect(gapWhat(candidate({ slot: "SAREE" }))).toBe("a neutral saree");
  });

  it("gapWhat keeps the colour next to the thing in pairs and sets", () => {
    expect(gapWhat(candidate({ slot: "FOOTWEAR", neutral: "black", feature: "rain_ok" }))).toBe(
      "a pair of black shoes for rain",
    );
    expect(gapWhat(candidate({ slot: "BANGLES", family: "yellow", band: "deep" }))).toBe("a set of deep yellow bangles");
  });

  it("every gap why id has a template", () => {
    expect(Object.keys(G).sort()).toEqual([...GAP_WHY_IDS].sort());
    for (const id of GAP_WHY_IDS) expect(G[id]({}).endsWith(".")).toBe(true);
  });

  it("gap why lines render", () => {
    expect(G.OCCASION_NO_LOOK({ label: "the sangeet", weekday: "Saturday" })).toBe(
      "Nothing in your closet fits the sangeet on Saturday.",
    );
    expect(G.OCCASION_NO_LOOK({})).toBe("Nothing in your closet fits the occasion.");
    expect(G.SLOT_MISSING({ slot: "BAG", dayTypes: "work" })).toBe("No bag for office days yet.");
    expect(G.SLOT_MISSING({ slotNoun: "bag", dayTypes: "work, casual,festive" })).toBe(
      "No bag for office, casual and festive days yet.",
    );
    expect(G.SLOT_MISSING({ slot: "FOOTWEAR" })).toBe("No pair of shoes yet.");
    expect(G.RAIN_FOOTWEAR({})).toBe("No shoes for rain.");
    expect(G.LAYER_COOL_MORNINGS({})).toBe("Nothing to layer on cool mornings.");
    expect(G.BLOUSE_FOR_SAREES({ count: 2 })).toBe("No blouse that goes with two of your sarees.");
    expect(G.BLOUSE_FOR_SAREES({ count: 1 })).toBe("No blouse that goes with one of your sarees.");
    expect(G.BLOUSE_FOR_SAREES({})).toBe("No blouse that goes with your sarees.");
    expect(G.EVENING_IN_COLOURS({})).toBe("Nothing evening-ready in your colours.");
    expect(G.NEUTRAL_BOTTOM_FOR_PRINTS({ count: 6 })).toBe("No neutral bottom for six printed tops.");
    expect(G.NEUTRAL_BOTTOM_FOR_PRINTS({ count: 12 })).toBe("No neutral bottom for 12 printed tops.");
    expect(G.NEUTRAL_BOTTOM_FOR_PRINTS({ count: 1 })).toBe("No neutral bottom for one printed top.");
    expect(G.NEUTRAL_BOTTOM_FOR_PRINTS({ count: 0 })).toBe("No neutral bottom for your printed tops.");
    expect(G.LIKE_UNMET({ feature: "defines_waist", dayTypes: "work" })).toBe(
      "Nothing that ties at the waist for office days.",
    );
    expect(G.LIKE_UNMET({ phrase: "with a high back", dayTypes: "evening" })).toBe(
      "Nothing with a high back for evening days.",
    );
    expect(G.LIKE_UNMET({})).toBe("Nothing that matches what you like yet.");
  });
});

describe("palette lines", () => {
  it("paletteLeanLine renders the lean", () => {
    expect(paletteLeanLine(palette())).toBe("Mostly cool and soft, with black and cream as your neutrals.");
  });

  it("paletteLeanLine drops the neutrals clause when there are none, and is null without a lean", () => {
    expect(paletteLeanLine(palette({ neutrals: [] }))).toBe("Mostly cool and soft.");
    expect(paletteLeanLine(palette({ lean: null }))).toBeNull();
  });

  it("paletteLeanLine reads mixed temperature and mid chroma in words", () => {
    const lean = (temperature: "warm" | "cool" | "mixed", chroma: "soft" | "mid" | "bright") =>
      paletteLeanLine(palette({ lean: { temperature, chroma, depth: "deep" }, neutrals: ["black"] }));
    expect(lean("mixed", "soft")).toBe("A mix of warm and cool, mostly soft, with black as your neutrals.");
    expect(lean("warm", "bright")).toBe("Mostly warm and bright, with black as your neutrals.");
    expect(lean("warm", "mid")).toBe("Mostly warm, with black as your neutrals.");
    expect(lean("mixed", "mid")).toBe("A mix of warm and cool, with black as your neutrals.");
  });

  it("paletteLeanLine names at most three neutrals", () => {
    expect(paletteLeanLine(palette({ neutrals: ["black", "white", "denim"] }))).toBe(
      "Mostly cool and soft, with black, white and denim as your neutrals.",
    );
    expect(paletteLeanLine(palette({ neutrals: ["black", "white", "denim", "tan", " "] }))).toBe(
      "Mostly cool and soft, with black, white and denim as your neutrals.",
    );
  });

  it("paletteConfidenceLine says where the palette comes from", () => {
    expect(paletteConfidenceLine(palette())).toBe("From the 14 pieces you've added. It sharpens as you wear things.");
    expect(paletteConfidenceLine(palette({ pieceCount: 9 }))).toBe(
      "From the nine pieces you've added. It sharpens as you wear things.",
    );
    expect(paletteConfidenceLine(palette({ pieceCount: 1 }))).toBe(
      "From the one piece you've added. It sharpens as you wear things.",
    );
    expect(paletteConfidenceLine(palette({ pieceCount: 0 }))).toBe("Add a few pieces and we'll read your colours.");
    expect(paletteConfidenceLine(palette({ basis: "worn" }))).toBe(
      "From what you've worn so far. It sharpens as you wear more.",
    );
    expect(paletteConfidenceLine(palette({ basis: "worn", confidence: "medium" }))).toBe("From what you wear most.");
    expect(paletteConfidenceLine(palette({ basis: "worn", confidence: "high" }))).toBe("From months of what you wear.");
  });
});

describe("learnedLine", () => {
  it("learnedLine renders the spec's line", () => {
    expect(learnedLine(learned({}))).toBe("You swap out sleeveless tops on office days");
  });

  it("learnedLine reads the sign, the feature and the day type", () => {
    expect(learnedLine(learned({ feature: "colour:pink", value: 0.5, dayType: "casual" }))).toBe(
      "You keep pink pieces for casual days",
    );
    const words = (feature: FeaturePref["feature"]) => learnedLine(learned({ feature, value: 0.4, dayType: "evening" }));
    expect(words("fabric:linen")).toBe("You keep linen for evening days");
    expect(words("fabric:faux_leather")).toBe("You keep faux leather for evening days");
    expect(words("silhouette:a_line")).toBe("You keep A-line fits for evening days");
    expect(words("silhouette:fitted")).toBe("You keep close fits for evening days");
    expect(words("pattern:floral")).toBe("You keep floral prints for evening days");
    expect(words("pattern:solid")).toBe("You keep solid colours for evening days");
    expect(words("neckline:v")).toBe("You keep V necklines for evening days");
    expect(words("neckline:off_shoulder")).toBe("You keep off-shoulder necklines for evening days");
    expect(words("length:knee")).toBe("You keep knee-length pieces for evening days");
    expect(words("length:cropped")).toBe("You keep cropped pieces for evening days");
    expect(words("rise:high")).toBe("You keep high-rise bottoms for evening days");
    expect(words("sleeve:three_quarter")).toBe("You keep three-quarter-sleeve tops for evening days");
    expect(words("colour:sea_green")).toBe("You keep sea green pieces for evening days");
    expect(learnedLine(learned({ dayType: "active" }))).toBe("You swap out sleeveless tops on gym days");
    expect(learnedLine(learned({ dayType: "festive", value: 0.3 }))).toBe("You keep sleeveless tops for festive days");
  });
});

describe("ALL_TEMPLATE_SAMPLES", () => {
  it("holds the spec's literal lines and every template's bare form", () => {
    const samples = new Set(ALL_TEMPLATE_SAMPLES());
    for (const line of [
      "The wrap ties at the waist.",
      "Linen and cotton for a 34° day.",
      "Crepe won't crease over nine hours.",
      "Denim stays home; this dries fast.",
      "Mostly cool and soft, with black and cream as your neutrals.",
      "From the 14 pieces you've added. It sharpens as you wear things.",
      "You swap out sleeveless tops on office days",
    ]) {
      expect(samples.has(line)).toBe(true);
    }
    for (const id of REASON_IDS) expect(samples.has(R[id]({}))).toBe(true);
    for (const id of GAP_WHY_IDS) expect(samples.has(G[id]({}))).toBe(true);
  });

  it("is deterministic and free of repeats", () => {
    const a = ALL_TEMPLATE_SAMPLES();
    expect(ALL_TEMPLATE_SAMPLES()).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });
});
