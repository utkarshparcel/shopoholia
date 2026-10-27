import {
  hexToOklch,
  hueFamily,
  isNeutral,
  lightBand,
  neutralName,
  normalizeHex,
  ringNeighbours,
  temperature,
} from "./colour.js";
import type {
  HueFamily,
  LightBand,
  Palette,
  PaletteConfidence,
  PaletteLean,
  StyleColour,
  StyleItem,
  StyleMetric,
  Swatch,
} from "./types.js";

/**
 * The palette learned from the closet (spec §5.3), and how close a piece sits to it.
 * Pure and deterministic. Every number here is a starting value.
 */

/** At most this many swatches. */
export const PALETTE_MAX_SWATCHES = 8;
/** A neutral is one they rely on when it holds at least this share of all colour weight. */
export const PALETTE_NEUTRAL_MIN_SHARE = 0.05;
/** The lean's thresholds: warm share, weighted mean chroma and weighted mean lightness. */
export const PALETTE_LEAN = {
  warmFrom: 0.6,
  coolUpTo: 0.4,
  softBelow: 0.1,
  brightFrom: 0.15,
  lightFrom: 0.7,
  deepBelow: 0.5,
} as const;
/** Low below `medium`; high at `high` or more on both counts; medium otherwise. Worn pieces have wears180 > 0. */
export const PALETTE_CONFIDENCE_THRESHOLDS = {
  medium: { wornPieces: 10, wears: 20 },
  high: { wornPieces: 30, wears: 60 },
} as const;
/** What each palette confidence multiplies the score by. */
export const PALETTE_CONFIDENCE_VALUE: Readonly<Record<PaletteConfidence, number>> = { low: 0.3, medium: 0.6, high: 1.0 };
/** Per-colour values for `paletteScore`. A swatch scores weight ÷ `fullAt`, up to 1. */
export const PALETTE_SCORE = { fullAt: 0.15, neighbour: 0.3, neutral: 0.2, far: -0.5, unknown: 0 } as const;

const BANDS: readonly LightBand[] = ["light", "mid", "deep"];

/** The colour's palette bin: `${family}-${band}`, with every neutral (rule neutrals included) in `neutral-${band}`. Null without a valid hex. */
export function paletteBinOf(colour: StyleColour): { key: string; family: HueFamily; band: LightBand } | null {
  const o = hexToOklch(colour.hex);
  if (o === null) return null;
  const family: HueFamily = isNeutral(colour) ? "neutral" : hueFamily(o);
  const band = lightBand(o);
  return { key: `${family}-${band}`, family, band };
}

/** low 0.3, medium 0.6, high 1.0. */
export function paletteConfidenceValue(c: PaletteConfidence): number {
  return PALETTE_CONFIDENCE_VALUE[c];
}

function positive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function byId(a: StyleItem, b: StyleItem): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

interface Bin {
  key: string;
  family: HueFamily;
  band: LightBand;
  weight: number;
  hexes: Map<string, number>;
}

function heaviestHex(hexes: ReadonlyMap<string, number>): string {
  let best = "";
  let bestWeight = -1;
  for (const [hex, weight] of hexes) {
    if (weight > bestWeight || (weight === bestWeight && hex < best)) {
      best = hex;
      bestWeight = weight;
    }
  }
  return best;
}

function confidenceOf(wornPieces: number, wears: number): PaletteConfidence {
  const { medium, high } = PALETTE_CONFIDENCE_THRESHOLDS;
  if (wornPieces < medium.wornPieces || wears < medium.wears) return "low";
  return wornPieces >= high.wornPieces && wears >= high.wears ? "high" : "medium";
}

/**
 * Learns the palette from the items' colours. Each colour weighs share × (1 + ln(1 + wears180)).
 * The result doesn't depend on the order of `items` or `metrics`.
 */
export function learnPalette(items: readonly StyleItem[], metrics: readonly StyleMetric[]): Palette {
  const wears = new Map<string, number>();
  for (const m of metrics) {
    const w = positive(m.wears180);
    if (w > 0) wears.set(m.itemId, (wears.get(m.itemId) ?? 0) + w);
  }

  const bins = new Map<string, Bin>();
  const neutralWeights = new Map<string, number>();
  let total = 0;
  let chromatic = 0;
  let warm = 0;
  let chromaSum = 0;
  let lightSum = 0;
  let pieceCount = 0;
  let wornPieces = 0;
  let wearTotal = 0;

  for (const item of [...items].sort(byId)) {
    const worn = wears.get(item.id) ?? 0;
    const factor = 1 + Math.log(1 + worn);
    let contributed = false;
    for (const colour of item.attributes?.colours ?? []) {
      const o = hexToOklch(colour.hex);
      const bin = paletteBinOf(colour);
      const weight = positive(colour.share) * factor;
      if (o === null || bin === null || weight <= 0) continue;
      contributed = true;
      total += weight;

      const entry = bins.get(bin.key) ?? { ...bin, weight: 0, hexes: new Map<string, number>() };
      entry.weight += weight;
      const hex = normalizeHex(colour.hex)!;
      entry.hexes.set(hex, (entry.hexes.get(hex) ?? 0) + weight);
      bins.set(bin.key, entry);

      if (bin.family === "neutral") {
        const name = neutralName(colour)!;
        neutralWeights.set(name, (neutralWeights.get(name) ?? 0) + weight);
      } else {
        chromatic += weight;
        if (temperature(o) === "warm") warm += weight;
        chromaSum += weight * o.c;
        lightSum += weight * o.l;
      }
    }
    if (contributed) {
      pieceCount += 1;
      if (worn > 0) {
        wornPieces += 1;
        wearTotal += worn;
      }
    }
  }

  const swatches: Swatch[] = [...bins.values()]
    .sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, PALETTE_MAX_SWATCHES)
    .map((b) => ({ key: b.key, family: b.family, band: b.band, hex: heaviestHex(b.hexes), weight: b.weight / total }));

  const neutrals = [...neutralWeights.entries()]
    .filter(([, w]) => w / total >= PALETTE_NEUTRAL_MIN_SHARE)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name]) => name);

  return {
    swatches,
    lean: chromatic > 0 ? leanOf(warm / chromatic, chromaSum / chromatic, lightSum / chromatic) : null,
    neutrals,
    confidence: confidenceOf(wornPieces, wearTotal),
    basis: wearTotal > 0 ? "worn" : "owned",
    pieceCount,
  };
}

function leanOf(warmShare: number, chroma: number, light: number): PaletteLean {
  const t = PALETTE_LEAN;
  return {
    temperature: warmShare >= t.warmFrom ? "warm" : warmShare <= t.coolUpTo ? "cool" : "mixed",
    chroma: chroma < t.softBelow ? "soft" : chroma >= t.brightFrom ? "bright" : "mid",
    depth: light >= t.lightFrom ? "light" : light < t.deepBelow ? "deep" : "mid",
  };
}

function nextBand(a: LightBand, b: LightBand): boolean {
  return Math.abs(BANDS.indexOf(a) - BANDS.indexOf(b)) === 1;
}

function colourValue(colour: StyleColour, palette: Palette): number {
  const bin = paletteBinOf(colour);
  if (bin === null) return isNeutral(colour) ? PALETTE_SCORE.neutral : PALETTE_SCORE.unknown;
  const own = palette.swatches.find((s) => s.key === bin.key);
  if (own !== undefined) return Math.min(1, own.weight / PALETTE_SCORE.fullAt);
  const near = ringNeighbours(bin.family);
  const neighbour = palette.swatches.some(
    (s) => (s.band === bin.band && near.includes(s.family)) || (s.family === bin.family && nextBand(s.band, bin.band)),
  );
  if (neighbour) return PALETTE_SCORE.neighbour;
  return bin.family === "neutral" ? PALETTE_SCORE.neutral : PALETTE_SCORE.far;
}

/**
 * How close the item's colours sit to the palette, from −1 to 1: the share-weighted mean of each colour's value,
 * times the palette's confidence. 0 for an untagged item, an item with no colours, or an empty palette.
 */
export function paletteScore(item: StyleItem, palette: Palette): number {
  const colours = item.attributes?.colours ?? [];
  if (colours.length === 0 || palette.swatches.length === 0) return 0;
  let sum = 0;
  let shares = 0;
  for (const colour of colours) {
    const share = positive(colour.share);
    if (share === 0) continue;
    sum += share * colourValue(colour, palette);
    shares += share;
  }
  if (shares === 0) return 0;
  const score = (sum / shares) * paletteConfidenceValue(palette.confidence);
  return Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
}
