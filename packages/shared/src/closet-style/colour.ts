import type { HueFamily, LightBand, Oklch, StyleColour } from "./types.js";

/**
 * Real colour (spec §5.3): hex to OKLCH, neutrals, hue families, temperature and pair harmony.
 * Pure: no I/O, no clock, no randomness. Every number here is a starting value.
 */

/** Below this chroma a colour reads as neutral. */
export const NEUTRAL_CHROMA = 0.04;
/** Below this chroma a colour is muted; at or above it, strong. */
export const MUTED_CHROMA = 0.1;
/** The lightness gap that makes a same-hue pair tonal. */
export const TONAL_LIGHTNESS_GAP = 0.15;
/** A solid picks up a print's colour when their OKLab distance is at most this. */
export const PRINT_MATCH_DISTANCE = 0.08;

/** Colours that count as neutral by name, whatever their chroma. */
export const RULE_NEUTRALS: readonly string[] = ["denim", "tan", "camel", "olive", "cream"];
/** Names that count as neutral when there is no valid hex to measure. */
export const NAME_NEUTRALS: readonly string[] = [
  "black", "white", "off-white", "grey", "gray", "charcoal", "beige", "ivory", ...RULE_NEUTRALS,
];

/** How a neutral name with no valid hex is reported; rule neutrals keep their own name. */
export const NAME_NEUTRAL_LABELS: Readonly<Record<string, string>> = {
  black: "black",
  white: "white",
  "off-white": "white",
  ivory: "white",
  beige: "white",
  grey: "grey",
  gray: "grey",
  charcoal: "grey",
};

/** Lightness bands: light at `light` or more, deep below `deep`, mid between. */
export const LIGHT_BANDS = { light: 0.75, deep: 0.45 } as const;
/** A measured neutral's name: "black" below `black`, "white" at `white` or more, "grey" between. */
export const NEUTRAL_LIGHTNESS = { black: 0.3, white: 0.9 } as const;
/** Warm hues run from `from` through 360 to `to` (exclusive); the rest are cool. */
export const WARM_HUES = { from: 345, to: 115 } as const;

/** Brown: hue in [minH, maxH), lightness below maxL and chroma below maxC. */
export const BROWN = { minH: 20, maxH: 100, maxL: 0.55, maxC: 0.13 } as const;
/** Hues at or above `from` or below `to` are pink at `pinkMinL` lightness or more, purple below it. */
export const PINK_PURPLE = { from: 320, to: 10, pinkMinL: 0.5 } as const;
/** The remaining hue ranges, in degrees: [from, to). */
export const FAMILY_HUES: readonly { family: HueFamily; from: number; to: number }[] = [
  { family: "red", from: 10, to: 45 },
  { family: "orange", from: 45, to: 80 },
  { family: "yellow", from: 80, to: 115 },
  { family: "green", from: 115, to: 175 },
  { family: "teal", from: 175, to: 230 },
  { family: "blue", from: 230, to: 285 },
  { family: "purple", from: 285, to: 320 },
];

/** The hue families in ring order; it wraps, and brown sits off it next to red and orange. */
export const FAMILY_RING: readonly HueFamily[] = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"];
/** The ring families brown neighbours. */
export const BROWN_NEIGHBOURS: readonly HueFamily[] = ["red", "orange"];

/** Hue gaps (degrees) for the harmony table. */
export const HARMONY_HUES = { sameHue: 20, neighbour: 50, opposite: 150, clashFrom: 60, clashTo: 140 } as const;
/** Harmony scores, by rule (spec §5.3). */
export const HARMONY_SCORES = {
  bothBusy: -0.4,
  printMatch: 0.7,
  neutral: 0.6,
  tonal: 0.8,
  sameHue: 0.4,
  neighbour: 0.6,
  opposite: 0.5,
  clash: -0.6,
  festiveClash: 0.2,
  other: 0,
  nameSameWord: 0.4,
  nameNeutral: 0.6,
  nameOther: 0,
} as const;

// ── Hex to OKLCH (Björn Ottosson, "A perceptual color space for image processing", 2020) ──

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const NO_CHROMA = 1e-9;

/** "#rgb", "#rrggbb", with or without "#", in any case, as lowercase "#rrggbb". Anything else is null. */
export function normalizeHex(hex: string): string | null {
  if (typeof hex !== "string") return null;
  const match = HEX.exec(hex);
  if (match === null) return null;
  const digits = match[1]!.toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits}`;
}

function toLinear(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

// A closet repeats a few dozen colours across every look, so conversions and name splits are
// remembered (MEMO_MAX distinct inputs each, then the memo starts over).
const MEMO_MAX = 4096;
const OKLCH_MEMO = new Map<string, Oklch | null>();
const WORDS_MEMO = new Map<string, readonly string[]>();

function remember<V>(memo: Map<string, V>, key: string, value: V): V {
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(key, value);
  return value;
}

/** sRGB hex to OKLCH, or null when the hex isn't valid. */
export function hexToOklch(hex: string): Oklch | null {
  if (typeof hex !== "string") return null;
  let o = OKLCH_MEMO.get(hex);
  if (o === undefined) o = remember(OKLCH_MEMO, hex, convertHex(hex));
  // A copy, so a caller that changes the result can't change the next one.
  return o === null ? null : { ...o };
}

function convertHex(hex: string): Oklch | null {
  const norm = normalizeHex(hex);
  if (norm === null) return null;
  const n = Number.parseInt(norm.slice(1), 16);
  const r = toLinear((n >> 16) & 255);
  const g = toLinear((n >> 8) & 255);
  const b = toLinear(n & 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.hypot(A, B);
  const h = c < NO_CHROMA ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** Euclidean distance in OKLab. */
export function oklabDistance(a: Oklch, b: Oklch): number {
  const ha = (a.h * Math.PI) / 180;
  const hb = (b.h * Math.PI) / 180;
  return Math.hypot(a.l - b.l, a.c * Math.cos(ha) - b.c * Math.cos(hb), a.c * Math.sin(ha) - b.c * Math.sin(hb));
}

// ── Names ─────────────────────────────────────────────────────────────────────

const RULE_NEUTRAL_SET: ReadonlySet<string> = new Set(RULE_NEUTRALS);
const NAME_NEUTRAL_SET: ReadonlySet<string> = new Set(NAME_NEUTRALS);

function textOf(colour: StyleColour, key: "name" | "hex"): string {
  const value = (colour as unknown as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "string" ? value : "";
}

/** The name's whole words, lowercased; a hyphenated word also counts as its parts ("off-white", "off", "white"). */
function nameWords(name: string): readonly string[] {
  const known = WORDS_MEMO.get(name);
  if (known !== undefined) return known;
  const tokens = name.toLowerCase().split(/[^\p{L}-]+/u).filter((t) => t !== "");
  return remember(
    WORDS_MEMO,
    name,
    tokens.flatMap((t) => (t.includes("-") ? [t, ...t.split("-").filter((p) => p !== "")] : [t])),
  );
}

/** The name's last word ("light blue" → "blue"), or "" when there is none. */
function lastWord(name: string): string {
  const words = name.trim().toLowerCase().split(/\s+/);
  return words[words.length - 1] ?? "";
}

function ruleNeutralOf(words: readonly string[]): string | undefined {
  return words.find((w) => RULE_NEUTRAL_SET.has(w));
}

// ── Neutrals, families, bands, temperature ───────────────────────────────────

/** Low chroma, or a rule neutral by name. With no valid hex, any neutral name. */
export function isNeutral(colour: StyleColour): boolean {
  const words = nameWords(textOf(colour, "name"));
  const o = hexToOklch(textOf(colour, "hex"));
  if (o === null) return words.some((w) => NAME_NEUTRAL_SET.has(w));
  return o.c < NEUTRAL_CHROMA || ruleNeutralOf(words) !== undefined;
}

/** The neutral's name: its rule name, else black, grey or white by lightness. Null when it isn't neutral. */
export function neutralName(colour: StyleColour): string | null {
  if (!isNeutral(colour)) return null;
  const words = nameWords(textOf(colour, "name"));
  const rule = ruleNeutralOf(words);
  if (rule !== undefined) return rule;
  const o = hexToOklch(textOf(colour, "hex"));
  if (o !== null) {
    if (o.l < NEUTRAL_LIGHTNESS.black) return "black";
    return o.l >= NEUTRAL_LIGHTNESS.white ? "white" : "grey";
  }
  const word = words.find((w) => NAME_NEUTRAL_SET.has(w))!;
  return NAME_NEUTRAL_LABELS[word] ?? word;
}

/** The hue family, checked in the order of the spec's table. */
export function hueFamily(o: Oklch): HueFamily {
  const { l, c, h } = o;
  if (c < NEUTRAL_CHROMA) return "neutral";
  if (h >= BROWN.minH && h < BROWN.maxH && l < BROWN.maxL && c < BROWN.maxC) return "brown";
  if (h >= PINK_PURPLE.from || h < PINK_PURPLE.to) return l >= PINK_PURPLE.pinkMinL ? "pink" : "purple";
  return FAMILY_HUES.find((f) => h >= f.from && h < f.to)?.family ?? "neutral";
}

/** Light, mid or deep by OKLCH lightness. */
export function lightBand(o: Oklch): LightBand {
  if (o.l >= LIGHT_BANDS.light) return "light";
  return o.l < LIGHT_BANDS.deep ? "deep" : "mid";
}

/** Hue temperature: neutral below the neutral chroma, warm from red through yellow, cool otherwise. */
export function temperature(o: Oklch): "warm" | "cool" | "neutral" {
  if (o.c < NEUTRAL_CHROMA) return "neutral";
  return o.h >= WARM_HUES.from || o.h < WARM_HUES.to ? "warm" : "cool";
}

/** Both colours have chroma and share a temperature. A neutral has no warmth to share. */
export function sameWarmth(a: Oklch, b: Oklch): boolean {
  const t = temperature(a);
  return t !== "neutral" && t === temperature(b);
}

/** The families one step from `family`: its two ring neighbours, plus brown for red and orange. */
export function ringNeighbours(family: HueFamily): readonly HueFamily[] {
  if (family === "brown") return BROWN_NEIGHBOURS;
  const i = FAMILY_RING.indexOf(family);
  if (i < 0) return [];
  const n = FAMILY_RING.length;
  const ring = [FAMILY_RING[(i + n - 1) % n]!, FAMILY_RING[(i + 1) % n]!];
  return BROWN_NEIGHBOURS.includes(family) ? [...ring, "brown"] : ring;
}

// ── Harmony between two pieces ───────────────────────────────────────────────

export interface HarmonyColour {
  colour: StyleColour;
  oklch: Oklch | null;
  neutral: boolean;
}

/** `busy`: the pattern isn't solid. `accent`: the slot is an accessory or footwear. */
export interface HarmonyPiece {
  main: HarmonyColour;
  colours: readonly HarmonyColour[];
  busy: boolean;
  accent: boolean;
}

/** A colour measured once for harmony. Any input is accepted; missing fields read as empty. */
export function harmonyColour(colour: StyleColour): HarmonyColour {
  const share = (colour as unknown as Record<string, unknown> | null | undefined)?.share;
  const safe: StyleColour = {
    name: textOf(colour, "name"),
    hex: textOf(colour, "hex"),
    share: typeof share === "number" && Number.isFinite(share) ? share : 0,
  };
  return { colour: safe, oklch: hexToOklch(safe.hex), neutral: isNeutral(safe) };
}

function hueGap(a: Oklch, b: Oklch): number {
  const d = Math.abs(a.h - b.h) % 360;
  return Math.min(d, 360 - d);
}

function picksUp(solid: HarmonyPiece, print: HarmonyPiece): boolean {
  const s = solid.main.oklch;
  if (s === null) return false;
  return print.colours.some((p) => p.oklch !== null && oklabDistance(s, p.oklch) <= PRINT_MATCH_DISTANCE);
}

function byName(a: HarmonyColour, b: HarmonyColour): number {
  if (a.neutral || b.neutral) return HARMONY_SCORES.nameNeutral;
  const word = lastWord(a.colour.name);
  return word !== "" && word === lastWord(b.colour.name) ? HARMONY_SCORES.nameSameWord : HARMONY_SCORES.nameOther;
}

/** How well two pieces' colours sit together, from −1 to 1 (spec §5.3). The first matching rule applies. */
export function harmony(a: HarmonyPiece, b: HarmonyPiece, festive: boolean): number {
  if (a.busy && b.busy) return HARMONY_SCORES.bothBusy;
  if (a.busy !== b.busy && (a.busy ? picksUp(b, a) : picksUp(a, b))) return HARMONY_SCORES.printMatch;
  const x = a.main.oklch;
  const y = b.main.oklch;
  if (x === null || y === null) return byName(a.main, b.main);
  if (a.main.neutral || b.main.neutral) return HARMONY_SCORES.neutral;
  const dh = hueGap(x, y);
  if (dh < HARMONY_HUES.sameHue) {
    return Math.abs(x.l - y.l) >= TONAL_LIGHTNESS_GAP ? HARMONY_SCORES.tonal : HARMONY_SCORES.sameHue;
  }
  if (dh < HARMONY_HUES.neighbour) return HARMONY_SCORES.neighbour;
  if (dh >= HARMONY_HUES.opposite && (x.c < MUTED_CHROMA || y.c < MUTED_CHROMA || a.accent || b.accent)) {
    return HARMONY_SCORES.opposite;
  }
  if (dh >= HARMONY_HUES.clashFrom && dh <= HARMONY_HUES.clashTo && x.c >= MUTED_CHROMA && y.c >= MUTED_CHROMA) {
    return festive ? HARMONY_SCORES.festiveClash : HARMONY_SCORES.clash;
  }
  return HARMONY_SCORES.other;
}
