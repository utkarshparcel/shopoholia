import { defaultRainOk, defaultWarmth, fabricOf } from "../closet-style/fabrics.js";
import { materialsOf } from "../closet-style/fields.js";
import type { StylePiece } from "../closet-style/score.js";
import { prepareStylePiece } from "../closet-style/score.js";
import type { GapCandidate } from "../closet-style/types.js";
import type { ItemAttributes, ItemSlot, LegCoverage } from "../schemas/closet-item.js";
import { BODY_FIELD_MIN_CONFIDENCE } from "../schemas/closet-item.js";
import { DAY_MS, dayMs } from "./dates.js";
import type { ComposerItem, ComposerMetric, ComposerSettings } from "./input.js";
import { hash32 } from "./rng.js";

/** The closet, normalised once per call: one `Piece` per wearable item. */

export interface Laundry {
  /** Wears before a washed piece is dirty; null when the count never makes it dirty. */
  afterWears: number | null;
  /** A gym day's wear makes its pieces dirty straight away. */
  sweat: boolean;
}

/** Same normalisation as the universe's `normalizeLaundryRules`. */
export function laundryOf(raw: ComposerSettings["laundryRules"]): Laundry {
  const n = raw?.dirtyAfterWears;
  return {
    afterWears: n === null ? null : typeof n === "number" && n > 0 ? Math.min(30, Math.floor(n)) : 3,
    sweat: raw?.dirtyOnSweatTag ?? true,
  };
}

/** The look itself, which footwear and accessories are then chosen around. Lead pieces first. */
export const CORE_ORDER = [
  "DRESS", "JUMPSUIT", "SAREE", "KURTA", "COORD_TOP", "TOP", "ACTIVE_TOP",
  "BLOUSE", "COORD_BOTTOM", "BOTTOM", "ACTIVE_BOTTOM",
] as const satisfies readonly ItemSlot[];
export type CoreSlot = (typeof CORE_ORDER)[number];
export const CORE_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>(CORE_ORDER);

/** The slots that decide the upper body: shoulders, underarms, and whether hair can go up. */
export const UPPER_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>([
  "TOP", "COORD_TOP", "ACTIVE_TOP", "DRESS", "JUMPSUIT", "KURTA", "BLOUSE",
]);

/** The order slots appear in an outfit. */
export const SLOT_ORDER: readonly ItemSlot[] = [
  ...CORE_ORDER,
  "DUPATTA", "LAYER", "FOOTWEAR", "BAG", "EARRINGS", "NECKLACE", "BANGLES", "WATCH", "HAIR_ACCESSORY", "OTHER",
];

/** Pieces that go in the wash, so the dirty-after-N rule limits how often they repeat. */
const WASHED_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>([...CORE_ORDER, "DUPATTA", "LAYER"]);

export interface Piece {
  id: string;
  slot: ItemSlot;
  setId: string | null;
  subtype: string;
  colour: string | null;
  /** The colour's last word, which harmony is judged on ("light blue" → "blue"). */
  tone: string | null;
  material: string | null;
  solid: boolean;
  /** 1 lounge … 5 black tie; 3 when unknown. */
  formality: number;
  warmMin: number | null;
  warmMax: number | null;
  rainOk: boolean | null;
  eveningOk: boolean | null;
  occasions: readonly string[];
  sporty: boolean;
  walkability: number | null;
  sleeve: string | null;
  neckline: string | null;
  silhouette: string | null;
  /** Leg length as tagged, trusted or not: the rain rule reads it, not a backup check. */
  rawLegs: LegCoverage | null;
  /** Body fields, kept only where they count (§8.1). */
  coverage: ItemAttributes["coverage"];
  fit: ItemAttributes["fit"];
  hair: ItemAttributes["hair"];
  wearCount: number;
  lastWornAt: string | null;
  /** `lastWornAt` in ms, parsed once. */
  lastWornMs: number | null;
  /** Higher for pieces worn less, less recently, or at a higher cost per wear. 0 to 2. */
  underworn: number;
  washed: boolean;
  /** Wears left before the laundry rule makes it dirty. */
  capacity: number;
  clean: boolean;
  /** The days it is away until: lent, at the tailor or at the dry cleaner. Null entries never come back. */
  awayUntil: readonly (string | null)[];
  /** hash32(seed | id), for seeded tie-breaks. */
  hash: number;
  /** The item as the style engine measures it, once per compose. */
  style: StylePiece;
  /** Everything a lead piece's style harmony reads: what goes with it is worked out once per key. */
  colourKey: string;
}

export interface Closet {
  seed: string;
  /** Overdue returns and recency are judged from this date. */
  asOf: string;
  laundry: Laundry;
  pieces: Piece[];
  byId: Map<string, Piece>;
  bySlot: Map<ItemSlot, Piece[]>;
}

/** A body field counts when the user set or confirmed it, or the model is confident enough. */
function trusted(item: ComposerItem, attrs: ItemAttributes, group: string, key: string): boolean {
  const path = `${group}.${key}`;
  const confirmed = item.attributesConfirmed;
  if (item.attributesSource === "USER" || confirmed[path] || confirmed[group]) return true;
  return (attrs.confidence[path] ?? attrs.confidence[group] ?? 0) >= BODY_FIELD_MIN_CONFIDENCE;
}

function gate<T extends object>(item: ComposerItem, attrs: ItemAttributes, group: string, values: T): T {
  const out: Partial<T> = {};
  for (const key of Object.keys(values) as (keyof T & string)[]) {
    if (trusted(item, attrs, group, key)) out[key] = values[key];
  }
  return out as T;
}

/** The first non-blank value, lowercased. */
function lowerFirst(values: readonly string[]): string | null {
  const first = values.find((v) => v.trim() !== "");
  return first === undefined ? null : first.trim().toLowerCase();
}

/** The colour's last word, which harmony is judged on: "light blue" → "blue". */
export function toneOf(colour: string): string {
  return colour.slice(colour.lastIndexOf(" ") + 1);
}

export function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

function toPiece(item: ComposerItem, metric: ComposerMetric | undefined, laundry: Laundry, seed: string): Piece | null {
  const a = item.attributes;
  const slot = item.slot ?? a?.slot ?? null;
  if (slot === null || item.deletedAt !== null || item.closetStatus === "STORED") return null;
  const feel: readonly string[] = a?.feel ?? [];
  const colour = lowerFirst([...item.colors, ...(a?.colours ?? []).map((c) => c.name)]);
  const wearCount = metric?.wearCount ?? 0;
  const lastWornAt = metric?.lastWornAt ?? null;
  const washed = WASHED_SLOTS.has(slot);
  const n = laundry.afterWears;
  const awayUntil: (string | null)[] = [];
  if (item.lentTo !== null) awayUntil.push(item.lentDueOn);
  if (item.tailorOrderId !== null) awayUntil.push(item.tailorPickupOn);
  if (item.dryCleanTicket !== null) awayUntil.push(item.dryCleanPickupOn);
  // Untagged pieces take their warmth and rain from the fabric (style spec §5.4).
  const cloth = a === null ? fabricOf(materialsOf(item)) : null;
  const warmth = cloth === null ? null : defaultWarmth(cloth);
  const style = prepareStylePiece(item);
  return {
    id: item.id,
    slot,
    setId: item.setId,
    subtype: (a?.subtype || item.category).toLowerCase(),
    colour,
    tone: colour === null ? null : toneOf(colour),
    material: lowerFirst([...item.materials, ...(a?.materials ?? [])]),
    solid: a?.pattern === "solid",
    formality: item.formality ?? a?.formality ?? 3,
    warmMin: item.warmthMinC ?? a?.warmth.minC ?? warmth?.minC ?? null,
    warmMax: item.warmthMaxC ?? a?.warmth.maxC ?? warmth?.maxC ?? null,
    rainOk: a?.rainOk ?? (cloth === null ? null : defaultRainOk(cloth)),
    eveningOk: a?.eveningOk ?? null,
    occasions: (a?.occasions ?? []).map((o) => o.toLowerCase()),
    sporty: feel.includes("sporty") || slot === "ACTIVE_TOP" || slot === "ACTIVE_BOTTOM",
    walkability: a?.footwear?.walkability ?? null,
    sleeve: a?.sleeve ?? null,
    neckline: a?.neckline ?? null,
    silhouette: a?.silhouette ?? null,
    rawLegs: a?.coverage.legs ?? null,
    coverage: a ? gate(item, a, "coverage", a.coverage) : {},
    fit: a ? gate(item, a, "fit", a.fit) : {},
    hair: a ? gate(item, a, "hair", a.hair) : {},
    wearCount,
    lastWornAt,
    lastWornMs: lastWornAt === null ? null : Date.parse(lastWornAt),
    underworn: 0,
    washed,
    capacity: washed && n !== null ? n - (wearCount % n) : Infinity,
    clean: item.laundryStatus === "CLEAN",
    awayUntil,
    hash: hash32(`${seed}|${item.id}`),
    style,
    colourKey: colourKeyOf(colour, style),
  };
}

/** The tone, every colour, the pattern and how festive it is: what `pairHarmony` reads of a lead piece. */
function colourKeyOf(colour: string | null, style: StylePiece): string {
  const h = style.harmony;
  const a = style.item.attributes;
  const festive = a !== null && a.feel.includes("festive") ? a.formality : 0;
  const colours = h.colours.map((c) => `${c.colour.hex}/${c.colour.name}`).join(",");
  return `${colour ?? ""}|${h.main.colour.hex}/${h.main.colour.name}|${colours}|${h.busy}|${h.accent}|${festive}`;
}

const RECENCY_DAYS = 45;

/**
 * Normalises the closet once per call. Items are taken in id order, so input order never
 * matters, and each slot lists its pieces in seeded hash order, which is how ties break.
 */
export function buildCloset(
  items: readonly ComposerItem[],
  metrics: readonly ComposerMetric[],
  settings: ComposerSettings,
  seed: string,
  asOf: string,
): Closet {
  const laundry = laundryOf(settings.laundryRules);
  const byMetric = new Map(metrics.map((m) => [m.wardrobeItemId, m]));
  const pieces: Piece[] = [];
  const costs = new Map<string, number>();
  let maxCpw = 0;
  for (const item of [...items].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const piece = toPiece(item, byMetric.get(item.id), laundry, seed);
    if (piece === null) continue;
    pieces.push(piece);
    if (item.priceSource !== "NONE" && item.costMinor > 0) {
      const cpw = item.costMinor / Math.max(piece.wearCount, 1);
      costs.set(piece.id, cpw);
      maxCpw = Math.max(maxCpw, cpw);
    }
  }
  const bySlot = new Map<ItemSlot, Piece[]>();
  const start = dayMs(asOf);
  for (const p of pieces) {
    const days = p.lastWornMs === null ? RECENCY_DAYS : Math.floor((start - p.lastWornMs) / DAY_MS);
    const recency = Math.min(Math.max(days, 0) / RECENCY_DAYS, 1);
    const cpw = costs.get(p.id);
    p.underworn = 1 / (1 + p.wearCount / 6) + 0.6 * recency + (cpw === undefined ? 0 : (0.4 * cpw) / maxCpw);
    pushTo(bySlot, p.slot, p);
  }
  // Stable, so a hash collision falls back to id order.
  for (const list of bySlot.values()) list.sort((a, b) => a.hash - b.hash);
  return { seed, asOf, laundry, pieces, byId: new Map(pieces.map((p) => [p.id, p])), bySlot };
}

/** The id a gap candidate's piece takes; no real item has it. */
export const CANDIDATE_ID = "00000000-0000-4000-8000-000000000000";

/** `underworn` for a piece with no wears and no price, as `buildCloset` scores one. */
const NEVER_WORN = 1 + 0.6;

/**
 * A piece that doesn't exist yet, for counting the looks it would make (Task B1, gaps): the
 * candidate's slot and colour, untagged, never worn and clean, at the given formality, and made
 * for rain or the evening when the candidate's feature says so.
 */
export function candidatePiece(closet: Closet, candidate: GapCandidate, formality: number): Piece {
  const colour = candidate.neutral ?? (candidate.family === "neutral" ? null : candidate.family);
  const item: ComposerItem = {
    id: CANDIDATE_ID,
    slot: candidate.slot,
    setId: null,
    materials: [],
    formality,
    warmthMinC: null,
    warmthMaxC: null,
    attributes: null,
    attributesSource: null,
    attributesConfirmed: {},
    priceSource: "NONE",
    deletedAt: null,
    category: candidate.slot.toLowerCase(),
    colors: colour === null ? [] : [colour],
    costMinor: 0,
    laundryStatus: "CLEAN",
    closetStatus: "ACTIVE",
    dryCleanTicket: null,
    dryCleanPickupOn: null,
    lentTo: null,
    lentDueOn: null,
    tailorOrderId: null,
    tailorPickupOn: null,
  };
  const p = toPiece(item, undefined, closet.laundry, closet.seed) as Piece;
  p.underworn = NEVER_WORN;
  if (candidate.feature === "rain_ok") p.rainOk = true;
  if (candidate.feature === "evening") p.eveningOk = true;
  return p;
}

const NONE: readonly Piece[] = [];

export function slotPieces(closet: Closet, slot: ItemSlot): readonly Piece[] {
  return closet.bySlot.get(slot) ?? NONE;
}

/** Clean, home, and not lent out on `date`. A return due before `asOf` is overdue, so it doesn't count. */
export function availableOn(p: Piece, date: string, asOf: string): boolean {
  return p.clean && p.awayUntil.every((until) => until !== null && until >= asOf && date > until);
}

export function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

const NEUTRALS = [
  "black", "white", "grey", "gray", "beige", "navy", "cream", "ivory", "khaki", "tan", "denim", "natural",
];
const WARM = [
  "red", "orange", "yellow", "mustard", "rust", "coral", "peach", "gold", "tan", "camel", "brown", "beige",
  "cream", "ivory", "khaki", "olive", "sage", "terracotta", "maroon", "burgundy", "pink", "natural",
];
const COOL = ["blue", "navy", "teal", "green", "emerald", "mint", "purple", "lilac", "lavender", "silver", "denim"];

const WARM_BIT = 1;
const COOL_BIT = 2;
const NEUTRAL_BIT = 4;
/** Each tone's families as bits, so a pair takes two lookups. */
const TONE_BITS = new Map<string, number>();
for (const [bit, tones] of [[WARM_BIT, WARM], [COOL_BIT, COOL], [NEUTRAL_BIT, NEUTRALS]] as const) {
  for (const tone of tones) TONE_BITS.set(tone, (TONE_BITS.get(tone) ?? 0) | bit);
}

export type Relation = "TONAL" | "SAME_WARMTH" | "NEUTRAL" | "CONTRAST";

/** How two colour tones sit together. */
export function relation(x: string, y: string): Relation {
  if (x === y) return "TONAL";
  const bx = TONE_BITS.get(x) ?? 0;
  const by = TONE_BITS.get(y) ?? 0;
  if (bx & by & (WARM_BIT | COOL_BIT)) return "SAME_WARMTH";
  if ((bx | by) & NEUTRAL_BIT) return "NEUTRAL";
  return "CONTRAST";
}

const HARMONY: Record<Relation, number> = { TONAL: 0.8, SAME_WARMTH: 1, NEUTRAL: 0.7, CONTRAST: 0.2 };

/** 0.2 (a clash) to 1 (same warmth); 0.4 when a colour is unknown. */
export function harmony(a: Piece, b: Piece): number {
  return a.tone === null || b.tone === null ? 0.4 : HARMONY[relation(a.tone, b.tone)];
}

/** Both colours known and not clashing. */
export function goes(a: Piece, b: Piece): boolean {
  return a.tone !== null && b.tone !== null && relation(a.tone, b.tone) !== "CONTRAST";
}

/** "black satin"; the subtype stands in for an unknown material. */
export function fabric(p: Piece): string {
  return p.colour === null ? (p.material ?? p.subtype) : `${p.colour} ${p.material ?? p.subtype}`;
}

/** "sage mini". */
export function pieceName(p: Piece): string {
  return p.colour === null ? p.subtype : `${p.colour} ${p.subtype}`;
}

/** "straw bag", or just "clutch": a bag reads by what it's made of, not its colour. */
export function bagName(p: Piece): string {
  return p.material === null ? p.subtype : `${p.material} ${p.subtype}`;
}

/** "shorts" and "wedges" take a plural verb; "dress" doesn't. */
export function isPlural(noun: string): boolean {
  return /[^s]s$/.test(noun);
}

const BARE_NECKLINES: ReadonlySet<string | null> = new Set(["strapless", "off_shoulder", "one_shoulder", "halter"]);

/** The neckline or shoulders are bare, so earrings finish the look. */
export function bareNeck(core: readonly Piece[]): boolean {
  return core.some((p) => BARE_NECKLINES.has(p.neckline) || p.coverage.shoulders === "bare");
}

/** Every upper piece is built for hair up. */
export function hairUpOk(core: readonly Piece[]): boolean {
  return core.every((p) => !UPPER_SLOTS.has(p.slot) || p.hair.upFriendly === true);
}

/** "strapless mini", "one-shoulder mini", "sleeveless top", or "sage mini". */
export function describe(p: Piece): string {
  if (p.neckline !== null && BARE_NECKLINES.has(p.neckline)) return `${p.neckline.replace("_", "-")} ${p.subtype}`;
  return p.sleeve === "sleeveless" ? `sleeveless ${p.subtype}` : pieceName(p);
}

const LEG_RANK: Record<LegCoverage, number> = { above_knee: 0, knee: 1, midi: 2, ankle: 3, floor: 4, trousers: 4 };

/** The piece that covers the most leg, from the fields that count. */
export function legPiece(pieces: readonly Piece[]): Piece | null {
  let best: Piece | null = null;
  for (const p of pieces) {
    const value = p.coverage.legs;
    if (value !== undefined && (best === null || LEG_RANK[value] > LEG_RANK[best.coverage.legs as LegCoverage])) {
      best = p;
    }
  }
  return best;
}

export const LONG_LEGS: ReadonlySet<LegCoverage | undefined> = new Set<LegCoverage | undefined>([
  "ankle", "floor", "trousers",
]);
