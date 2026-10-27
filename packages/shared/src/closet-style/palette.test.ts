import { describe, expect, it } from "vitest";
import {
  PALETTE_MAX_SWATCHES,
  learnPalette,
  paletteBinOf,
  paletteConfidenceValue,
  paletteScore,
} from "./palette.js";
import type { Palette, PaletteConfidence, StyleAttributes, StyleColour, StyleItem, StyleMetric } from "./types.js";

const col = (name: string, hex: string, share = 1): StyleColour => ({ name, hex, share });

const base: StyleAttributes = {
  slot: "TOP",
  subtype: "tee",
  colours: [],
  pattern: "solid",
  materials: ["cotton"],
  warmth: { minC: 15, maxC: 35 },
  rainOk: false,
  formality: 2,
  occasions: [],
  feel: [],
  coverage: {},
  fit: {},
  eveningOk: false,
  confidence: {},
};

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const item = (n: number, colours: readonly StyleColour[]): StyleItem => ({
  id: id(n),
  slot: "TOP",
  materials: [],
  attributes: { ...base, colours },
  attributesSource: "MODEL",
  attributesConfirmed: {},
});

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** A small seeded generator (LCG), so property tests are repeatable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const POOL: readonly StyleColour[] = [
  col("red", "#ff0000"),
  col("maroon", "#800000"),
  col("rust", "#b7410e"),
  col("brown", "#8b4513"),
  col("orange", "#ffa500"),
  col("mustard", "#ffd700"),
  col("green", "#008000"),
  col("lime", "#00ff00"),
  col("teal", "#008080"),
  col("navy", "#000080"),
  col("blue", "#0000ff"),
  col("plum", "#800080"),
  col("magenta", "#ff00ff"),
  col("pink", "#ff69b4"),
  col("black", "#111111"),
  col("white", "#ffffff"),
  col("grey", "#808080"),
  col("olive", "#808000"),
  col("denim blue", "#1560bd"),
  col("tan", "#d2b48c"),
  col("cream", "#fffdd0"),
  col("sage", "#9caf88"),
  col("mystery", "nope"),
  col("black", ""),
  col("sky", "ABC"),
];

function randomCloset(rand: () => number, size: number): { items: StyleItem[]; metrics: StyleMetric[] } {
  const items: StyleItem[] = [];
  const metrics: StyleMetric[] = [];
  for (let n = 0; n < size; n++) {
    const count = Math.floor(rand() * 4);
    const colours = range(0, count).map(() => {
      const c = POOL[Math.floor(rand() * POOL.length)]!;
      return { ...c, share: Math.round(rand() * 100) / 100 };
    });
    items.push(item(n, colours));
    if (rand() < 0.6) metrics.push({ itemId: id(n), wears180: Math.floor(rand() * 40) });
    if (rand() < 0.1) metrics.push({ itemId: id(n), wears180: Math.floor(rand() * 5) });
  }
  metrics.push({ itemId: id(9999), wears180: 50 });
  return { items, metrics };
}

/** n pieces in one colour, worn `wears` times in all, each at least once. */
function wornCloset(n: number, wears: number): { items: StyleItem[]; metrics: StyleMetric[] } {
  const items = range(0, n).map((i) => item(i, [col("red", "#ff0000")]));
  const each = Math.floor(wears / n);
  const metrics = items.map((it, i) => ({ itemId: it.id, wears180: each + (i < wears - each * n ? 1 : 0) }));
  return { items, metrics };
}

describe("learnPalette", () => {
  it("learnPalette is deterministic", () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
      const rand = lcg(seed);
      const { items, metrics } = randomCloset(rand, 80);
      const first = learnPalette(items, metrics);
      for (let k = 0; k < 5; k++) {
        expect(learnPalette(shuffle(items, rand), shuffle(metrics, rand))).toEqual(first);
      }
      expect(first.swatches.length).toBeLessThanOrEqual(PALETTE_MAX_SWATCHES);
      for (let i = 1; i < first.swatches.length; i++) {
        expect(first.swatches[i - 1]!.weight).toBeGreaterThanOrEqual(first.swatches[i]!.weight);
      }
    }
  });

  it("learnPalette weights wears", () => {
    const navy = range(0, 10).map((i) => item(i, [col("navy", "#000080")]));
    const rust = [10, 11].map((i) => item(i, [col("rust", "#b7410e")]));
    const worn = (wears180: number) => rust.map((r) => ({ itemId: r.id, wears180 }));

    // Each colour weighs share × (1 + ln(1 + wears180)): 10 unworn navy pieces weigh 10.
    const at30 = learnPalette([...navy, ...rust], worn(30));
    const weightOf = (p: Palette, key: string) => p.swatches.find((s) => s.key === key)!.weight;
    expect(weightOf(at30, "red-mid") / weightOf(at30, "blue-deep")).toBeCloseTo((2 * (1 + Math.log(31))) / 10, 12);

    const at60 = learnPalette([...navy, ...rust], worn(60));
    expect(at60.swatches.map((s) => s.key)).toEqual(["red-mid", "blue-deep"]);
    expect(at60.swatches[0]!.hex).toBe("#b7410e");
    expect(at60.basis).toBe("worn");
    expect(at60.pieceCount).toBe(12);
  });

  it("learnPalette caps at 8 swatches", () => {
    const hexes = [
      "#ff0000", "#800000", "#00ff00", "#008000", "#0000ff", "#000080", "#ffa500",
      "#ffd700", "#008080", "#800080", "#ff00ff", "#808080", "#ffffff", "#000000",
    ];
    const items = hexes.map((hex, i) => item(i, [col(`c${i}`, hex)]));
    const metrics = items.map((it, i) => ({ itemId: it.id, wears180: i }));
    const p = learnPalette(items, metrics);
    expect(p.swatches).toHaveLength(8);
    const expected = hexes.slice(6).reverse().map((hex) => paletteBinOf(col("x", hex))!.key);
    expect(p.swatches.map((s) => s.key)).toEqual(expected);
    const total = hexes.reduce((sum, _, i) => sum + 1 + Math.log(1 + i), 0);
    expect(p.swatches[0]!.weight).toBeCloseTo((1 + Math.log(14)) / total, 12);
    expect(p.swatches.reduce((sum, s) => sum + s.weight, 0)).toBeLessThan(1);
    expect(p.pieceCount).toBe(14);
  });

  it("breaks weight ties by key, and a bin's hex by the smallest hex string", () => {
    const p = learnPalette(
      [item(1, [col("blue", "#0000ff")]), item(2, [col("red", "#ff0000")]), item(3, [col("red", "#fe0000")])],
      [],
    );
    expect(p.swatches.map((s) => [s.key, s.hex])).toEqual([
      ["red-mid", "#fe0000"],
      ["blue-mid", "#0000ff"],
    ]);
    const tie = learnPalette([item(1, [col("blue", "#0000ff")]), item(2, [col("red", "#ff0000")])], []);
    expect(tie.swatches.map((s) => s.key)).toEqual(["blue-mid", "red-mid"]);
    const heavy = learnPalette(
      [item(1, [col("red", "#FF0000")]), item(2, [col("red", "#fe0000")]), item(3, [col("red", "f00")])],
      [],
    );
    expect(heavy.swatches[0]!.hex).toBe("#ff0000");
  });

  it("puts rule neutrals in the neutral bins and lists the neutrals relied on", () => {
    const items = [
      ...range(0, 10).map((i) => item(i, [col("red", "#ff0000")])),
      ...range(10, 15).map((i) => item(i, [col("black", "#111111")])),
      ...range(15, 18).map((i) => item(i, [col("white", "#ffffff")])),
      item(18, [col("olive", "#808000")]),
      item(19, [col("grey", "#808080", 0.5)]),
    ];
    const p = learnPalette(items, []);
    expect(p.swatches.map((s) => s.key)).toEqual(["red-mid", "neutral-deep", "neutral-light", "neutral-mid"]);
    expect(p.swatches[3]!.hex).toBe("#808000");
    expect(p.neutrals).toEqual(["black", "white", "olive"]);
    expect(p.lean).toEqual({ temperature: "warm", chroma: "bright", depth: "mid" });
    expect(p.swatches[0]!.weight).toBeCloseTo(10 / 19.5, 12);
    expect(paletteBinOf(col("denim blue", "#1560bd"))).toEqual({ key: "neutral-mid", family: "neutral", band: "mid" });
    expect(paletteBinOf(col("cream", "#fffdd0"))).toEqual({ key: "neutral-light", family: "neutral", band: "light" });
  });

  it("leans on non-neutral colours only", () => {
    const lean = (colours: StyleColour[]) => learnPalette([item(1, colours)], []).lean;
    expect(lean([col("red", "#ff0000", 0.6), col("blue", "#0000ff", 0.4)])?.temperature).toBe("warm");
    expect(lean([col("red", "#ff0000", 0.4), col("blue", "#0000ff", 0.6)])?.temperature).toBe("cool");
    expect(lean([col("red", "#ff0000", 0.5), col("blue", "#0000ff", 0.5)])?.temperature).toBe("mixed");
    expect(lean([col("teal", "#008080")])).toEqual({ temperature: "cool", chroma: "soft", depth: "mid" });
    expect(lean([col("brown", "#8b4513")])).toEqual({ temperature: "warm", chroma: "mid", depth: "deep" });
    expect(lean([col("mustard", "#ffd700"), col("black", "#111111")])).toEqual({
      temperature: "warm",
      chroma: "bright",
      depth: "light",
    });
    expect(lean([col("black", "#111111"), col("olive", "#808000")])).toBeNull();
  });

  it("skips what it can't bin and ignores metrics it can't match", () => {
    const untagged: StyleItem = { ...item(5, []), attributes: null };
    const items = [
      item(1, [col("red", "#ff0000")]),
      item(2, [col("mystery", "nope"), col("black", "")]),
      item(3, [col("red", "#ff0000", 0)]),
      item(4, []),
      untagged,
    ];
    const metrics: StyleMetric[] = [
      { itemId: id(1), wears180: 3 },
      { itemId: id(1), wears180: 2 },
      { itemId: id(2), wears180: 40 },
      { itemId: id(3), wears180: 40 },
      { itemId: id(5), wears180: 40 },
      { itemId: id(77), wears180: 40 },
      { itemId: id(1), wears180: Number.NaN },
      { itemId: id(1), wears180: -4 },
    ];
    const p = learnPalette(items, metrics);
    expect(p.pieceCount).toBe(1);
    expect(p.swatches).toEqual([{ key: "red-mid", family: "red", band: "mid", hex: "#ff0000", weight: 1 }]);
    expect(p.basis).toBe("worn");
    expect(p.confidence).toBe("low");
  });

  it("an empty closet gives an empty, low-confidence palette", () => {
    expect(learnPalette([], [])).toEqual({
      swatches: [],
      lean: null,
      neutrals: [],
      confidence: "low",
      basis: "owned",
      pieceCount: 0,
    });
  });

  it("palette confidence thresholds", () => {
    const conf = (n: number, wears: number) => {
      const { items, metrics } = wornCloset(n, wears);
      return learnPalette(items, metrics).confidence;
    };
    expect(conf(9, 100)).toBe("low");
    expect(conf(10, 19)).toBe("low");
    expect(conf(10, 20)).toBe("medium");
    expect(conf(30, 60)).toBe("high");
    expect(conf(30, 59)).toBe("medium");
    expect(conf(29, 100)).toBe("medium");
    const owned = learnPalette(range(0, 12).map((i) => item(i, [col("red", "#ff0000")])), []);
    expect(owned.confidence).toBe("low");
    expect(owned.basis).toBe("owned");
  });

  it("counts only pieces that gave a colour towards confidence", () => {
    const { items, metrics } = wornCloset(10, 20);
    const untagged = range(100, 140).map((i) => ({ ...item(i, []), attributes: null }));
    const extra = untagged.map((it) => ({ itemId: it.id, wears180: 5 }));
    const p = learnPalette([...items, ...untagged], [...metrics, ...extra]);
    expect(p.confidence).toBe("medium");
    expect(p.pieceCount).toBe(10);
  });
});

describe("paletteScore", () => {
  const palette = (confidence: PaletteConfidence): Palette => ({
    swatches: [
      { key: "red-mid", family: "red", band: "mid", hex: "#ff0000", weight: 0.5 },
      { key: "neutral-deep", family: "neutral", band: "deep", hex: "#111111", weight: 0.2 },
      { key: "blue-deep", family: "blue", band: "deep", hex: "#000080", weight: 0.1 },
    ],
    lean: { temperature: "warm", chroma: "bright", depth: "mid" },
    neutrals: ["black"],
    confidence,
    basis: "worn",
    pieceCount: 40,
  });
  const high = palette("high");
  const score = (colours: StyleColour[], p: Palette = high) => paletteScore(item(1, colours), p);

  it("paletteScore", () => {
    const heavy = score([col("red", "#ff0000")]);
    const neighbourFamily = score([col("chocolate", "#d2691e")]);
    const neighbourBand = score([col("maroon", "#800000")]);
    const far = score([col("lime", "#00ff00")]);
    expect(heavy).toBe(1);
    expect(neighbourFamily).toBeCloseTo(0.3, 12);
    expect(neighbourBand).toBeCloseTo(0.3, 12);
    expect(far).toBeCloseTo(-0.5, 12);
    expect(heavy).toBeGreaterThan(neighbourFamily);
    expect(neighbourFamily).toBeGreaterThan(far);
    expect(score([col("navy", "#000080")])).toBeCloseTo(0.1 / 0.15, 12);

    for (const c of ["low", "medium", "high"] as const) {
      const p = palette(c);
      for (const colours of [[col("red", "#ff0000")], [col("lime", "#00ff00")], [col("maroon", "#800000", 0.3), col("lime", "#00ff00", 0.7)]]) {
        expect(score(colours, p)).toBeCloseTo(score(colours, high) * paletteConfidenceValue(c), 12);
      }
    }
    expect(score([col("lime", "#00ff00")], palette("low"))).toBeCloseTo(-0.15, 12);
  });

  it("every score lies in [−1, 1]", () => {
    const rand = lcg(7);
    for (let k = 0; k < 40; k++) {
      const { items, metrics } = randomCloset(rand, 30 + Math.floor(rand() * 60));
      const p = learnPalette(items, metrics);
      for (const c of ["low", "medium", "high"] as const) {
        for (const it of items) {
          const s = paletteScore(it, { ...p, confidence: c });
          expect(Number.isFinite(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(-1);
          expect(s).toBeLessThanOrEqual(1);
        }
      }
    }
    const full: Palette = { ...high, swatches: [{ key: "red-mid", family: "red", band: "mid", hex: "#ff0000", weight: 1 }] };
    expect(score([col("red", "#ff0000")], full)).toBe(1);
  });

  it("takes the share-weighted mean, with neutrals and unknown colours", () => {
    expect(score([col("red", "#ff0000", 0.5), col("lime", "#00ff00", 0.5)])).toBeCloseTo(0.25, 12);
    expect(score([col("red", "#ff0000", 3), col("lime", "#00ff00", 1)])).toBeCloseTo((3 - 0.5) / 4, 12);
    // White is neutral but not in the palette, and light is two bands from deep.
    expect(score([col("white", "#ffffff")])).toBeCloseTo(0.2, 12);
    // Grey sits one band from the black swatch.
    expect(score([col("grey", "#808080")])).toBeCloseTo(0.3, 12);
    // Olive is a rule neutral, so it bins with the neutrals.
    expect(score([col("olive", "#808000")])).toBeCloseTo(0.3, 12);
    // No valid hex: a neutral name still counts as neutral, anything else counts 0.
    expect(score([col("black", "bad-hex")])).toBeCloseTo(0.2, 12);
    expect(score([col("mystery", "")])).toBe(0);
    expect(score([col("red", "#ff0000", 0.5), col("mystery", "", 0.5)])).toBeCloseTo(0.5, 12);
    // Shares that are zero, negative or not numbers are ignored.
    expect(score([col("red", "#ff0000", 0), col("lime", "#00ff00", -1), col("lime", "#00ff00", Number.NaN)])).toBe(0);
  });

  it("an item with no attributes, no colours, or an empty palette scores 0", () => {
    expect(paletteScore({ ...item(1, []), attributes: null }, high)).toBe(0);
    expect(score([])).toBe(0);
    expect(score([col("red", "#ff0000")], learnPalette([], []))).toBe(0);
  });

  it("paletteConfidenceValue gives low 0.3, medium 0.6, high 1.0", () => {
    expect(paletteConfidenceValue("low")).toBe(0.3);
    expect(paletteConfidenceValue("medium")).toBe(0.6);
    expect(paletteConfidenceValue("high")).toBe(1);
  });

  it("paletteBinOf is null without a valid hex", () => {
    expect(paletteBinOf(col("black", ""))).toBeNull();
    expect(paletteBinOf(col("red", "#ff0000"))).toEqual({ key: "red-mid", family: "red", band: "mid" });
    expect(paletteBinOf(col("navy", "#000080"))).toEqual({ key: "blue-deep", family: "blue", band: "deep" });
  });
});
