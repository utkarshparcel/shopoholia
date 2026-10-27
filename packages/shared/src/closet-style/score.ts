import { harmony, harmonyColour, isNeutral } from "./colour.js";
import type { HarmonyPiece } from "./colour.js";
import { fabricOf, fabricTerm } from "./fabrics.js";
import type { BlendedFabric } from "./fabrics.js";
import { materialsOf, shape } from "./fields.js";
import { learnedScore } from "./learn.js";
import { paletteBinOf, paletteScore } from "./palette.js";
import { BODY_RULE_SLOTS, lookRuleTerms, pieceRuleTerms } from "./rules/women.js";
import type { RulePiece } from "./rules/women.js";
import { ZERO_TERM } from "./types.js";
import type {
  FeatureValue,
  ItemSlot,
  Likes,
  Palette,
  Proportions,
  StyleColour,
  StyleDay,
  StyleItem,
  StyleProfileInput,
  StyleReason,
  Term,
} from "./types.js";

/** How much each style term counts in a look's score (spec §5.1). They sum to 2.6. */
export const STYLE_WEIGHTS = { likes: 1.0, proportion: 0.5, palette: 0.5, fabric: 0.6 } as const;

/** Footwear, bags and accessories: the pieces harmony treats as accents. */
export const ACCENT_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>([
  "FOOTWEAR", "BAG", "EARRINGS", "NECKLACE", "BANGLES", "WATCH", "HAIR_ACCESSORY",
]);

/** The jewellery whose metal leans with the palette (spec §5.3). */
export const METAL_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>(["EARRINGS", "NECKLACE", "BANGLES", "WATCH"]);

/** What a gold or silver piece adds to, or takes from, its palette term. */
export const METAL_WEIGHT = 0.1;

/** The formality from which a festive day, or two festive pieces, make a bold clash work. */
export const FESTIVE_MIN_FORMALITY = 4;

/** How many looks' rule terms are kept between calls before the cache starts over. */
export const LOOK_CACHE_MAX = 50_000;

/** The colour-name words that mark each metal, matched as whole words. */
const METAL_WORDS = { gold: ["gold", "golden"], silver: ["silver"] } as const;

/** One item measured once per compose, for every term below. */
export interface StylePiece {
  item: StyleItem;
  harmony: HarmonyPiece;
  fabric: BlendedFabric | null;
  /** The main colour's OKLCH lightness, or null without a valid hex. */
  lightness: number | null;
  features: readonly FeatureValue[];
  rule: RulePiece;
}

/** What the style terms read besides the piece and the day. */
export interface StyleContext {
  profile: StyleProfileInput | null;
  palette: Palette;
}

type LikeTerms = { likes: Term; proportion: Term };

const EMPTY_COLOUR: StyleColour = { name: "", hex: "", share: 0 };
const NO_LOOK_TERMS: LikeTerms = { likes: ZERO_TERM, proportion: ZERO_TERM };
const clamp = (x: number): number => Math.max(-1, Math.min(1, x));
const slotOf = (item: StyleItem): ItemSlot | null => item.slot ?? item.attributes?.slot ?? null;
const shareOf = (c: StyleColour): number => (typeof c.share === "number" && Number.isFinite(c.share) ? c.share : 0);

/** The colour with the largest share; the first listed wins a tie. */
function mainColourIndex(colours: readonly StyleColour[]): number {
  let best = -1;
  for (let i = 0; i < colours.length; i++) {
    if (best < 0 || shareOf(colours[i]!) > shareOf(colours[best]!)) best = i;
  }
  return best;
}

function features(item: StyleItem, main: StyleColour | null, fabric: BlendedFabric | null): FeatureValue[] {
  const a = item.attributes;
  const out: FeatureValue[] = [];
  if (main) {
    const family = paletteBinOf(main)?.family ?? (isNeutral(main) ? "neutral" : null);
    if (family) out.push(`colour:${family}`);
  }
  if (a) out.push(`pattern:${a.pattern}`);
  if (fabric) out.push(`fabric:${fabric.parts[0]!.material}`);
  const silhouette = shape(item, "silhouette");
  if (silhouette) out.push(`silhouette:${silhouette}`);
  const length = shape(item, "length");
  if (length) out.push(`length:${length}`);
  const rise = shape(item, "rise");
  if (rise) out.push(`rise:${rise}`);
  if (a?.sleeve) out.push(`sleeve:${a.sleeve}`);
  if (a?.neckline) out.push(`neckline:${a.neckline}`);
  return out;
}

/**
 * The features learning reads (spec §7): the main colour's family, the pattern, the lead material,
 * the trusted silhouette, length and rise, and the sleeve and neckline when set.
 */
export function featuresOf(item: StyleItem): FeatureValue[] {
  const colours = item.attributes?.colours ?? [];
  const main = colours[mainColourIndex(colours)] ?? null;
  return features(item, main, fabricOf(materialsOf(item)));
}

/** Measures an item once: its harmony colours, fabric, lightness, features and rule piece. */
export function prepareStylePiece(item: StyleItem): StylePiece {
  const a = item.attributes;
  const colours = a?.colours ?? [];
  const index = mainColourIndex(colours);
  const harmonyColours = colours.map(harmonyColour);
  const main = harmonyColours[index] ?? harmonyColour(EMPTY_COLOUR);
  const slot = slotOf(item);
  const fabric = fabricOf(materialsOf(item));
  const lightness = main.oklch?.l ?? null;
  return {
    item,
    harmony: {
      main,
      colours: harmonyColours,
      busy: a !== null && a.pattern !== "solid",
      accent: slot !== null && ACCENT_SLOTS.has(slot),
    },
    fabric,
    lightness,
    features: features(item, colours[index] ?? null, fabric),
    rule: { item, fabric, lightness },
  };
}

// A compose scores the same pieces against one palette and one profile many times, so the terms that
// don't depend on the day are cached by object identity. A StylePiece is read-only once prepared.
const paletteCache = new WeakMap<StylePiece, { palette: Palette; score: number }>();
const ruleCache = new WeakMap<StylePiece, { likes: Likes | null; proportions: Proportions | null; terms: LikeTerms }>();
const pieceIds = new WeakMap<StylePiece, number>();
let nextPieceId = 0;
let lookCache: { likes: Likes | null; proportions: Proportions | null; terms: Map<string, LikeTerms> } | null = null;

function pieceId(p: StylePiece): number {
  let id = pieceIds.get(p);
  if (id === undefined) {
    id = nextPieceId++;
    pieceIds.set(p, id);
  }
  return id;
}

function ruleTerms(p: StylePiece, likes: Likes | null, proportions: Proportions | null): LikeTerms {
  const hit = ruleCache.get(p);
  if (hit && hit.likes === likes && hit.proportions === proportions) return hit.terms;
  const terms = pieceRuleTerms(p.rule, likes, proportions);
  ruleCache.set(p, { likes, proportions, terms });
  return terms;
}

function hasWord(name: string, words: readonly string[]): boolean {
  return name.toLowerCase().split(/[^\p{L}]+/u).some((w) => words.includes(w));
}

/** +1 for a gold piece, −1 for a silver one, 0 for both, neither, or a slot that isn't jewellery. */
function metalSign(item: StyleItem): number {
  const slot = slotOf(item);
  if (slot === null || !METAL_SLOTS.has(slot)) return 0;
  const names = (item.attributes?.colours ?? []).map((c) => (typeof c.name === "string" ? c.name : ""));
  const gold = names.some((n) => hasWord(n, METAL_WORDS.gold)) ? 1 : 0;
  const silver = names.some((n) => hasWord(n, METAL_WORDS.silver)) ? 1 : 0;
  return gold - silver;
}

function paletteValue(p: StylePiece, palette: Palette): number {
  const hit = paletteCache.get(p);
  if (hit && hit.palette === palette) return hit.score;
  const lean = palette.lean?.temperature;
  const metal = lean === "warm" ? METAL_WEIGHT : lean === "cool" ? -METAL_WEIGHT : 0;
  const score = clamp(paletteScore(p.item, palette) + metal * metalSign(p.item));
  paletteCache.set(p, { palette, score });
  return score;
}

/**
 * One piece's terms for a day. `likes` is the piece's like rows plus the learned score, clamped;
 * `palette` is the palette score with the metal lean, no reasons; `fabric` is the fabric term.
 */
export function pieceTerms(p: StylePiece, day: StyleDay, ctx: StyleContext): { likes: Term; palette: Term; fabric: Term } {
  const likes = ctx.profile?.likes ?? null;
  const rules = ruleTerms(p, likes, ctx.profile?.proportions ?? null).likes;
  const learned = ctx.profile ? learnedScore(p.features, day.dayType, ctx.profile.learned) : 0;
  return {
    likes: learned === 0 ? rules : { score: clamp(rules.score + learned), reasons: rules.reasons },
    palette: { score: paletteValue(p, ctx.palette), reasons: [] },
    fabric: fabricTerm(p.fabric, day, likes),
  };
}

const ruled = (p: StylePiece): boolean => {
  const slot = slotOf(p.item);
  return p.item.attributes !== null && slot !== null && BODY_RULE_SLOTS.has(slot);
};

/**
 * A look's terms. `likes` is the look-scope like rows. `proportion` is the piece-scope proportion rows
 * averaged over the look's ruled pieces, plus the look-scope rows, clamped. The day isn't read yet.
 */
export function lookTerms(look: readonly StylePiece[], _day: StyleDay, ctx: StyleContext): { likes: Term; proportion: Term } {
  const likes = ctx.profile?.likes ?? null;
  const proportions = ctx.profile?.proportions ?? null;
  if (look.length === 0 || (likes === null && proportions === null)) return NO_LOOK_TERMS;
  if (!lookCache || lookCache.likes !== likes || lookCache.proportions !== proportions || lookCache.terms.size >= LOOK_CACHE_MAX) {
    lookCache = { likes, proportions, terms: new Map() };
  }
  const key = look.map(pieceId).join(",");
  const hit = lookCache.terms.get(key);
  if (hit) return hit;
  const terms = lookRuleTermsOf(look, likes, proportions);
  lookCache.terms.set(key, terms);
  return terms;
}

function lookRuleTermsOf(look: readonly StylePiece[], likes: Likes | null, proportions: Proportions | null): LikeTerms {
  const whole = lookRuleTerms(look.map((p) => p.rule), likes, proportions);
  const pieces = proportions === null ? [] : look.filter(ruled).map((p) => ruleTerms(p, likes, proportions).proportion);
  let score = whole.proportion.score;
  const reasons: StyleReason[] = [];
  if (pieces.length > 0) {
    const n = pieces.length;
    score += pieces.reduce((sum, t) => sum + t.score, 0) / n;
    for (const t of pieces) for (const r of t.reasons) reasons.push({ ...r, strength: r.strength / n });
  }
  reasons.push(...whole.proportion.reasons);
  const proportion = score === 0 && reasons.length === 0 ? ZERO_TERM : { score: clamp(score), reasons };
  return { likes: whole.likes, proportion };
}

type StyleKey = keyof typeof STYLE_WEIGHTS;
const STYLE_KEYS = Object.keys(STYLE_WEIGHTS) as StyleKey[];

/** Σ STYLE_WEIGHTS[k] × (multiplier ?? 1) × score. A score or multiplier that isn't finite counts as 0 or 1. */
export function weighted(
  terms: Partial<Record<StyleKey, Term>>,
  multipliers: Partial<Record<StyleKey, number>> = {},
): number {
  let sum = 0;
  for (const k of STYLE_KEYS) {
    const t = terms[k];
    if (!t) continue;
    const m = multipliers[k];
    const score = Number.isFinite(t.score) ? t.score : 0;
    sum += STYLE_WEIGHTS[k] * (typeof m === "number" && Number.isFinite(m) ? m : 1) * score;
  }
  return sum;
}

const festivePiece = (p: StylePiece): boolean => {
  const a = p.item.attributes;
  return a !== null && a.formality >= FESTIVE_MIN_FORMALITY && a.feel.includes("festive");
};

/** How two pieces' colours sit together. A formal festive day, or two formal festive pieces, let a bold clash work. */
export function pairHarmony(a: StylePiece, b: StylePiece, day: StyleDay): number {
  const festive = (day.festive && day.formality >= FESTIVE_MIN_FORMALITY) || (festivePiece(a) && festivePiece(b));
  return harmony(a.harmony, b.harmony, festive);
}
