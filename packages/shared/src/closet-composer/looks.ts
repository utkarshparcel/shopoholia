import type { StyleContext } from "../closet-style/score.js";
import { lookTerms, pairHarmony, pieceTerms, STYLE_WEIGHTS, weighted } from "../closet-style/score.js";
import type { GapCandidate, StyleDay, StyleReason, Term } from "../closet-style/types.js";
import type { ItemSlot } from "../schemas/closet-item.js";
import { DAY_MS } from "./dates.js";
import type { Day } from "./day.js";
import type { ComposerSettings } from "./input.js";
import { ComposerSettingsSchema } from "./input.js";
import type { Closet, CoreSlot, Piece } from "./pieces.js";
import { availableOn, bareNeck, candidatePiece, CORE_ORDER, CORE_SLOTS, goes, hairUpOk, harmony, mean, pushTo, slotPieces } from "./pieces.js";
import { fold, FOLD_START, tieOf } from "./rng.js";

/** The soft-score weights after the user's learned multipliers (§8.8). Versioned with `COMPOSER_VERSION`. */
export interface Weights {
  harmony: number;
  forgotten: number;
  underworn: number;
  occasion: number;
  comfort: number;
  evening: number;
  variety: number;
}

export function weightsOf(settings: ComposerSettings): Weights {
  const m = settings.weights;
  return {
    harmony: m.harmony ?? 1,
    forgotten: 0.6 * (m.forgotten ?? 1),
    underworn: 0.5 * (m.costPerWear ?? 1),
    occasion: 0.8 * (m.occasion ?? 1),
    comfort: 0.4 * (m.comfort ?? 1),
    evening: 0.5,
    variety: 0.3 * (m.variety ?? 1),
  };
}

/** The user's multipliers on the style terms; a missing one counts as 1. */
export type StyleMultipliers = Partial<Record<keyof typeof STYLE_WEIGHTS, number>>;

export function styleMultipliersOf(settings: ComposerSettings): StyleMultipliers {
  const m = settings.weights;
  return { likes: m.likes, proportion: m.proportion, palette: m.palette, fabric: m.fabric };
}

/** One day as the style engine scores it (Task B1): the day, the palette and profile, and the multipliers. */
export interface DayStyle {
  day: StyleDay;
  ctx: StyleContext;
  multipliers: StyleMultipliers;
}

/**
 * How the style engine joins the composer's soft score. `pairHarmony` runs from −1 to 1 and maps onto
 * the composer's harmony scale as `harmonyOffset + harmonyScale × h`, then takes `harmonyMix` of the
 * pair's harmony, the name-based harmony keeping the rest; the piece and look terms are `weighted`
 * and then scaled. Starting values: the site week keeps every line up to a mix of 0.19 and flips its
 * wedges at 0.2, so 0.1 leaves a margin. Versioned with `COMPOSER_VERSION`.
 */
export const STYLE_JOIN = { harmonyMix: 0.1, harmonyOffset: 0.5, harmonyScale: 0.5, pieceScale: 1, lookScale: 1 } as const;

/** Two pieces' colour harmony: blended with the style engine's when the day is styled and either has a colour hex, the name-based one otherwise. */
export function harmonyOn(style: DayStyle | null, a: Piece, b: Piece): number {
  const named = harmony(a, b);
  if (style === null || (a.style.harmony.main.oklch === null && b.style.harmony.main.oklch === null)) return named;
  const hex = STYLE_JOIN.harmonyOffset + STYLE_JOIN.harmonyScale * pairHarmony(a.style, b.style, style.day);
  return (1 - STYLE_JOIN.harmonyMix) * named + STYLE_JOIN.harmonyMix * hex;
}

/** A base piece's style terms for the day, weighted and scaled. */
export function pieceStyle(p: Piece, style: DayStyle): number {
  return STYLE_JOIN.pieceScale * weighted(pieceTerms(p.style, style.day, style.ctx), style.multipliers);
}

/** The look's style terms for the day (its base pieces and layer), weighted and scaled. */
export function lookStyle(pieces: readonly Piece[], style: DayStyle): number {
  return STYLE_JOIN.lookScale * weighted(lookTerms(pieces.map((p) => p.style), style.day, style.ctx), style.multipliers);
}

/**
 * Why the style terms liked the look: the reasons behind its base pieces' terms and the look's own,
 * each scaled as its term counts in the score. Only reasons that raised the score.
 */
export function styleReasons(look: Worn, style: DayStyle): StyleReason[] {
  const out: StyleReason[] = [];
  const add = (terms: Partial<Record<keyof typeof STYLE_WEIGHTS, Term>>, scale: number) => {
    for (const k of Object.keys(terms) as (keyof typeof STYLE_WEIGHTS)[]) {
      const m = style.multipliers[k] ?? 1;
      for (const r of terms[k]?.reasons ?? []) {
        const strength = scale * STYLE_WEIGHTS[k] * m * r.strength;
        if (strength > 0) out.push({ ...r, strength });
      }
    }
  };
  for (const p of look.core) add(pieceTerms(p.style, style.day, style.ctx), STYLE_JOIN.pieceScale);
  const worn = look.layer === null ? look.core : [...look.core, look.layer];
  add(lookTerms(worn.map((p) => p.style), style.day, style.ctx), STYLE_JOIN.lookScale);
  return out;
}

/** A look as worn: the base pieces, lead first, then what goes with them. */
export interface Worn {
  core: readonly Piece[];
  layer: Piece | null;
  dupatta: Piece | null;
  footwear: Piece | null;
  earrings: Piece | null;
  bag: Piece | null;
  hair: Piece | null;
}

/** A look the composer built: it always has footwear. */
export interface Look extends Worn {
  footwear: Piece;
  score: number;
}

export const EMPTY_LOOK: Worn = {
  core: [], layer: null, dupatta: null, footwear: null, earrings: null, bag: null, hair: null,
};

/** Every piece of the look, in outfit order. */
export function piecesOf(look: Worn): Piece[] {
  const extra = [look.dupatta, look.layer, look.footwear, look.bag, look.earrings, look.hair];
  return [...look.core, ...extra.filter((p): p is Piece => p !== null)];
}

// Hard constraints (§8.4). The composer never proposes a look that breaks one.

const WARMTH_GIVE = 2;
export const MIN_WALKABILITY = 4;

/** The temperature sits in the piece's warmth range, give or take 2 °C. */
export function warmthOk(p: Piece, temp: number | null): boolean {
  return (
    temp === null ||
    ((p.warmMin === null || p.warmMin - WARMTH_GIVE <= temp) && (p.warmMax === null || temp <= p.warmMax + WARMTH_GIVE))
  );
}

/** A layer goes on when the low is under a base piece's range. */
export function needsLayer(p: Piece, day: Day): boolean {
  return day.low !== null && p.warmMin !== null && day.low < p.warmMin;
}

function inBand(p: Piece, day: Day): boolean {
  return day.band === null || (p.formality >= day.band[0] && p.formality <= day.band[1]);
}

/** On a rainy day a floor-length piece has to be made for rain. */
function rainProof(p: Piece, day: Day): boolean {
  return !day.rainy || p.rawLegs !== "floor" || p.rainOk === true;
}

function sportyOk(p: Piece, day: Day): boolean {
  return !day.active || p.sporty;
}

function shoeRainOk(p: Piece, day: Day): boolean {
  return !day.rainy || p.rainOk === true;
}

function walkOk(p: Piece, day: Day): boolean {
  return !day.longWalk || (p.walkability ?? 0) >= MIN_WALKABILITY;
}

export function coreOk(p: Piece, day: Day, asOf: string): boolean {
  return (
    availableOn(p, day.date, asOf) && warmthOk(p, day.high) && rainProof(p, day) && inBand(p, day) && sportyOk(p, day)
  );
}

export function layerOk(p: Piece, day: Day, asOf: string): boolean {
  return availableOn(p, day.date, asOf) && warmthOk(p, day.low) && inBand(p, day) && sportyOk(p, day);
}

export function footwearOk(p: Piece, day: Day, asOf: string): boolean {
  return (
    availableOn(p, day.date, asOf) && shoeRainOk(p, day) && inBand(p, day) && sportyOk(p, day) && walkOk(p, day)
  );
}

/** A broken hard constraint, shown as a warning when the user swaps a piece in anyway. */
export type Warning = "WARMTH" | "RAIN" | "FORMALITY" | "ACTIVE" | "WALK";
const WARNINGS: readonly Warning[] = ["WARMTH", "RAIN", "FORMALITY", "ACTIVE", "WALK"];

/** The hard constraints the look breaks on the day, availability aside. */
export function warnings(look: Worn, day: Day): Warning[] {
  const broken = new Set<Warning>();
  const check = (ok: boolean, warning: Warning) => {
    if (!ok) broken.add(warning);
  };
  for (const p of look.core) {
    check(warmthOk(p, day.high), "WARMTH");
    check(rainProof(p, day), "RAIN");
    check(inBand(p, day), "FORMALITY");
    check(sportyOk(p, day), "ACTIVE");
  }
  const layer = look.layer;
  if (layer === null) {
    check(!look.core.some((p) => needsLayer(p, day)), "WARMTH");
  } else {
    check(warmthOk(layer, day.low), "WARMTH");
    check(inBand(layer, day), "FORMALITY");
    check(sportyOk(layer, day), "ACTIVE");
  }
  const shoe = look.footwear;
  if (shoe !== null) {
    check(shoeRainOk(shoe, day), "RAIN");
    check(inBand(shoe, day), "FORMALITY");
    check(sportyOk(shoe, day), "ACTIVE");
    check(walkOk(shoe, day), "WALK");
  }
  return WARNINGS.filter((w) => broken.has(w));
}

/** The look can be worn that day: it is whole, every piece is free, and no hard constraint breaks. */
export function fits(look: Worn, day: Day, asOf: string): boolean {
  return (
    look.core.length > 0 &&
    look.footwear !== null &&
    piecesOf(look).every((p) => availableOn(p, day.date, asOf)) &&
    warnings(look, day).length === 0
  );
}

// Soft scores (§8.4): they rank the looks that pass.

export const FORGOTTEN_DAYS = 60;

/** Last worn 60 or more days before the day. */
export function forgotten(p: Piece, day: Day): boolean {
  return p.lastWornMs !== null && day.start - p.lastWornMs >= FORGOTTEN_DAYS * DAY_MS;
}

/** 0 to 1: tagged for the day's plans, and near the day's formality. */
export function occasionFit(p: Piece, day: Day): number {
  const tagged = p.occasions.some((o) => day.keywords.has(o)) ? 0.6 : 0;
  return tagged + 0.4 * (1 - Math.abs(p.formality - day.target) / 4);
}

/** 1 in the middle of the piece's warmth range, 0 past its edges; 0.5 when either is unknown. */
function comfort(p: Piece, temp: number | null): number {
  if (temp === null || p.warmMin === null || p.warmMax === null) return 0.5;
  const half = Math.abs(p.warmMax - p.warmMin) / 2;
  return Math.max(0, 1 - Math.abs(temp - (p.warmMin + p.warmMax) / 2) / (half + WARMTH_GIVE));
}

/** A base piece's own score for the day, with its style terms when the day is styled. */
export function unary(p: Piece, day: Day, w: Weights, style: DayStyle | null = null): number {
  return (
    w.underworn * 0.5 * p.underworn +
    (forgotten(p, day) ? w.forgotten : 0) +
    w.occasion * occasionFit(p, day) +
    w.comfort * comfort(p, day.high) +
    (day.evening && p.eveningOk === true ? w.evening : 0) +
    (style === null ? 0 : pieceStyle(p, style))
  );
}

/** The first highest-scoring entry: lists are in seeded order, so ties break on the seed. */
export function best<T>(list: readonly T[], score: (x: T) => number): T | null {
  let top: T | null = null;
  let topScore = -Infinity;
  for (const x of list) {
    const s = score(x);
    if (s > topScore) {
      top = x;
      topScore = s;
    }
  }
  return top;
}

export interface Scored {
  piece: Piece;
  score: number;
}

/** One day's pieces that pass its hard constraints, scored. Built once per day and shared by every search. */
export interface Pool {
  day: Day;
  weights: Weights;
  /** The day's style, or null to score as the composer did before the style engine. */
  style: DayStyle | null;
  core: Record<CoreSlot, Scored[]>;
  layers: Piece[];
  dupattas: Piece[];
  footwear: Piece[];
}

/** The style only changes scores: the same pieces pass with or without it. */
export function poolFor(closet: Closet, day: Day, weights: Weights, style: DayStyle | null = null): Pool {
  const asOf = closet.asOf;
  const layers = slotPieces(closet, "LAYER").filter((p) => layerOk(p, day, asOf));
  const core = {} as Record<CoreSlot, Scored[]>;
  for (const slot of CORE_ORDER) {
    const list: Scored[] = [];
    for (const p of slotPieces(closet, slot)) {
      // A piece that needs a layer can't be worn when no layer can.
      if (coreOk(p, day, asOf) && (layers.length > 0 || !needsLayer(p, day))) {
        list.push({ piece: p, score: unary(p, day, weights, style) });
      }
    }
    core[slot] = list.sort((a, b) => b.score - a.score);
  }
  return {
    day,
    weights,
    style,
    core,
    layers,
    dupattas: slotPieces(closet, "DUPATTA").filter((p) => availableOn(p, day.date, asOf)),
    footwear: slotPieces(closet, "FOOTWEAR").filter((p) => footwearOk(p, day, asOf)),
  };
}

/** What a search adds to the day's constraints: a check's fix, a restyle's reason, a penalty, footwear to keep. */
export interface Rule {
  piece?: (p: Piece) => boolean;
  look?: (core: readonly Piece[]) => boolean;
  bias?: (p: Piece) => number;
  footwear?: Piece | null;
}

export interface Candidates {
  /** How many looks pass. The tightest day is filled first. */
  count: number;
  /** The best looks, best first. */
  looks: Look[];
}

/** Base pieces considered per slot; every set still pairs with its match. */
const SHORTLIST = 12;
const LAYER_CHOICES = 3;
const LAYER_WEIGHT = 0.2;
const DUPATTA_BONUS = 0.05;

interface Search {
  pool: Pool;
  rule: Rule;
  keep: Piece | null;
  shoes: Map<string, Piece>;
  layers: Map<string, readonly Piece[]>;
  dupattas: Map<string, Piece | null>;
  looks: Look[];
}

/** What goes with a lead piece depends only on its colour, so it is worked out once per colour. */
function memo<V>(s: Search, map: Map<string, V>, lead: Piece, make: (s: Search, lead: Piece) => V): V {
  const key = s.pool.style === null ? (lead.tone ?? "") : lead.colourKey;
  if (map.has(key)) return map.get(key) as V;
  const value = make(s, lead);
  map.set(key, value);
  return value;
}

/** On a long day, each step of walkability past 3 counts this much. */
const WALK_WEIGHT = 0.1;

function bestShoe(s: Search, lead: Piece): Piece {
  const { day, weights: w, style } = s.pool;
  const score = (f: Piece) =>
    w.harmony * harmonyOn(style, lead, f) +
    0.5 * w.occasion * occasionFit(f, day) -
    0.2 * Math.abs(f.formality - day.target) +
    (day.long ? WALK_WEIGHT * ((f.walkability ?? 3) - 3) : 0);
  return best(s.pool.footwear, score) as Piece;
}

function shoeFor(s: Search, lead: Piece): Piece {
  return s.keep ?? memo(s, s.shoes, lead, bestShoe);
}

function bestLayers(s: Search, lead: Piece): readonly Piece[] {
  return s.pool.layers
    .map((p) => ({ p, score: harmonyOn(s.pool.style, lead, p) + 0.1 * p.underworn }))
    .sort(byScore)
    .slice(0, LAYER_CHOICES)
    .map((x) => x.p);
}

function layersFor(s: Search, lead: Piece): readonly Piece[] {
  return memo(s, s.layers, lead, bestLayers);
}

function bestDupatta(s: Search, kurta: Piece): Piece | null {
  return best(
    s.pool.dupattas.filter((d) => goes(kurta, d)),
    (d) => harmonyOn(s.pool.style, kurta, d),
  );
}

function dupattaFor(s: Search, kurta: Piece): Piece | null {
  return memo(s, s.dupattas, kurta, bestDupatta);
}

function emit(s: Search, core: Piece[], coreScore: number, pair: number, dupatta: Piece | null): void {
  if (s.rule.look !== undefined && !s.rule.look(core)) return;
  const lead = core[0];
  const style = s.pool.style;
  const footwear = shoeFor(s, lead);
  const shoe = harmonyOn(style, lead, footwear);
  const h = core.length > 1 ? (pair + shoe) / 2 : shoe;
  // The tie-breaker folds the base pieces, footwear, dupatta and layer, in that order.
  let folded = FOLD_START;
  let layered = false;
  for (const p of core) {
    folded = fold(folded, p.hash);
    layered ||= needsLayer(p, s.pool.day);
  }
  folded = fold(folded, footwear.hash);
  let score = coreScore + s.pool.weights.harmony * h;
  if (dupatta !== null) {
    score += DUPATTA_BONUS;
    folded = fold(folded, dupatta.hash);
  }
  if (!layered) {
    if (style !== null) score += lookStyle(core, style);
    s.looks.push({ core, layer: null, dupatta, footwear, earrings: null, bag: null, hair: null, score: score + tieOf(folded) });
    return;
  }
  for (const layer of layersFor(s, lead)) {
    let total = score + LAYER_WEIGHT * harmonyOn(style, lead, layer) + tieOf(fold(folded, layer.hash));
    if (style !== null) total += lookStyle([...core, layer], style);
    s.looks.push({ core, layer, dupatta, footwear, earrings: null, bag: null, hair: null, score: total });
  }
}

function pair(s: Search, a: Scored, b: Scored, dupatta: Piece | null = null): void {
  emit(s, [a.piece, b.piece], (a.score + b.score) / 2, harmonyOn(s.pool.style, a.piece, b.piece), dupatta);
}

/** Pieces from the same set (`setId`) pair with each other, whatever made the shortlist. */
function sets(s: Search, tops: readonly Scored[], bottoms: readonly Scored[]): void {
  const bySet = new Map<string | null, Scored[]>();
  for (const b of bottoms) pushTo(bySet, b.piece.setId, b);
  for (const t of tops) {
    if (t.piece.setId === null) continue;
    for (const b of bySet.get(t.piece.setId) ?? []) pair(s, t, b);
  }
}

/** The pool's list under the rule, best first. The pool's lists are sorted already, so only a bias re-sorts. */
function filtered(list: readonly Scored[], rule: Rule): readonly Scored[] {
  const { piece, bias } = rule;
  if (piece === undefined && bias === undefined) return list;
  const out: Scored[] = [];
  for (const x of list) {
    if (piece !== undefined && !piece(x.piece)) continue;
    out.push(bias === undefined ? x : { piece: x.piece, score: x.score + bias(x.piece) });
  }
  return bias === undefined ? out : out.sort(byScore);
}

/**
 * The day's looks under a rule, from the look templates (§8.4): TOP + BOTTOM, DRESS, JUMPSUIT,
 * a co-ord set, SAREE + BLOUSE, KURTA + BOTTOM with an optional dupatta, and active pieces.
 * Each gets footwear, and a layer when the low calls for one.
 */
export function candidates(pool: Pool, rule: Rule, limit: number): Candidates {
  if (pool.footwear.length === 0) return { count: 0, looks: [] };
  const keep = rule.footwear ?? null;
  const s: Search = {
    pool,
    rule,
    keep: keep !== null && pool.footwear.includes(keep) ? keep : null,
    shoes: new Map(),
    layers: new Map(),
    dupattas: new Map(),
    looks: [],
  };
  const all = {} as Record<CoreSlot, readonly Scored[]>;
  for (const slot of CORE_ORDER) all[slot] = filtered(pool.core[slot], rule);
  const short = (slot: CoreSlot) => all[slot].slice(0, SHORTLIST);

  for (const d of short("DRESS")) emit(s, [d.piece], d.score, 0, null);
  for (const j of short("JUMPSUIT")) emit(s, [j.piece], j.score, 0, null);
  const bottoms = short("BOTTOM");
  for (const t of short("TOP")) for (const b of bottoms) pair(s, t, b);
  const activeBottoms = short("ACTIVE_BOTTOM");
  for (const t of short("ACTIVE_TOP")) for (const b of activeBottoms) pair(s, t, b);
  for (const k of short("KURTA")) {
    const dupatta = dupattaFor(s, k.piece);
    for (const b of bottoms) {
      pair(s, k, b);
      if (dupatta !== null) pair(s, k, b, dupatta);
    }
  }
  sets(s, all.COORD_TOP, all.COORD_BOTTOM);
  sets(s, all.SAREE, all.BLOUSE);
  // A saree that isn't part of a set goes with any loose blouse whose colour works with it.
  const blouses = short("BLOUSE").filter((b) => b.piece.setId === null);
  for (const saree of short("SAREE")) {
    if (saree.piece.setId !== null) continue;
    for (const b of blouses) if (goes(saree.piece, b.piece)) pair(s, saree, b);
  }

  const count = s.looks.length;
  if (limit === 1) {
    const top = best(s.looks, (l) => l.score);
    return { count, looks: top === null ? [] : [top] };
  }
  return { count, looks: bestOf(s.looks, limit) };
}

/**
 * The `limit` best looks, best first, ties in the order they came: what a stable sort and a
 * slice give, without sorting thousands of looks to keep a few hundred.
 */
export function bestOf<T extends { score: number }>(looks: T[], limit: number): T[] {
  if (looks.length <= limit) return looks.sort(byScore);
  const scores = new Float64Array(looks.length);
  for (let i = 0; i < looks.length; i++) scores[i] = looks[i].score;
  const cut = scores.sort()[looks.length - limit];
  let ties = limit;
  for (const look of looks) if (look.score > cut) ties--;
  const kept: T[] = [];
  for (const look of looks) {
    if (look.score > cut) {
      kept.push(look);
    } else if (look.score === cut && ties > 0) {
      kept.push(look);
      ties--;
    }
  }
  return kept.sort(byScore);
}

function byScore(a: { score: number }, b: { score: number }): number {
  return b.score - a.score;
}

/** What joins a look beyond the day's own needs. */
export interface Extras {
  /** Dress it for the evening whatever the day says: earrings and a bag, evening pieces first. */
  evening: boolean;
  /** Earrings to keep, when they're free. */
  earrings: Piece | null;
}

export const NO_EXTRAS: Extras = { evening: false, earrings: null };

const STEP_PENALTY = 0.3;

/**
 * Accessories join when the user owns them and they suit the day: earrings when the neckline is
 * bare or the day runs into the evening, a bag for a day out, a hair accessory when every base
 * piece is built for hair up.
 */
export function accessorize(
  look: Look,
  closet: Closet,
  day: Day,
  w: Weights,
  extras: Extras,
  style: DayStyle | null = null,
): Look {
  const asOf = closet.asOf;
  const free = (slot: ItemSlot) => slotPieces(closet, slot).filter((p) => availableOn(p, day.date, asOf));
  const lead = look.core[0];
  const level = Math.round(mean(look.core.map((p) => p.formality)));
  const evening = extras.evening || day.evening;
  const near = (p: Piece) => w.harmony * harmonyOn(style, lead, p) - STEP_PENALTY * Math.abs(p.formality - level);
  const night = (p: Piece, bonus: number) => (evening && p.eveningOk === true ? bonus : 0);
  const kept = extras.earrings !== null && availableOn(extras.earrings, day.date, asOf) ? extras.earrings : null;
  const wantEarrings = evening || bareNeck(look.core);
  return {
    ...look,
    earrings: kept ?? (wantEarrings ? best(free("EARRINGS"), (e) => near(e) + night(e, 1)) : null),
    bag:
      extras.evening || day.out
        ? best(free("BAG"), (b) => near(b) + 0.5 * w.occasion * occasionFit(b, day) + night(b, 0.5))
        : null,
    hair: hairUpOk(look.core) ? best(free("HAIR_ACCESSORY"), (h) => w.harmony * harmonyOn(style, lead, h)) : null,
  };
}

/** A gap candidate's formality: the day's target, and at least this for a festive one. */
export const CANDIDATE_FORMALITY = { festiveMin: 4 } as const;

/** The closet with the piece as the only one in its slot. */
function withOnly(closet: Closet, p: Piece): Closet {
  const pieces = [...closet.pieces.filter((x) => x.slot !== p.slot), p];
  const bySlot = new Map(closet.bySlot);
  bySlot.set(p.slot, [p]);
  return { ...closet, pieces, byId: new Map(pieces.map((x) => [x.id, x])), bySlot };
}

/**
 * New passing looks that include a gap candidate, summed over the days (Task B1; the gaps'
 * `LookCounter`). A synthetic piece takes the candidate's slot alone, at each day's formality, and
 * the look builder counts every passing look it is in; an accessory counts where `accessorize`
 * would add it. Unstyled: the style terms only rank looks, and this counts them.
 */
export function countLooksWith(
  closet: Closet,
  candidate: GapCandidate,
  days: readonly Day[],
  weights: Weights = weightsOf(ComposerSettingsSchema.parse({})),
): number {
  let n = 0;
  for (const day of days) {
    const festive = candidate.feature === "festive";
    const synth = candidatePiece(closet, candidate, festive ? Math.max(day.target, CANDIDATE_FORMALITY.festiveMin) : day.target);
    const only = withOnly(closet, synth);
    const rule: Rule = CORE_SLOTS.has(synth.slot) ? { look: (core) => core.includes(synth) } : {};
    for (const look of candidates(poolFor(only, day, weights), rule, Number.MAX_SAFE_INTEGER).looks) {
      if (piecesOf(look).includes(synth) || piecesOf(accessorize(look, only, day, weights, NO_EXTRAS)).includes(synth)) n++;
    }
  }
  return n;
}
