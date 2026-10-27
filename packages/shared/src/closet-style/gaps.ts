import { RULE_NEUTRALS, isNeutral, ringNeighbours } from "./colour.js";
import { fabricOf } from "./fabrics.js";
import { materialsOf } from "./fields.js";
import { paletteBinOf } from "./palette.js";
import { BODY_RULE_SLOTS, pieceRuleTerms } from "./rules/women.js";
import type { RulePiece } from "./rules/women.js";
import type {
  DayType,
  Gap,
  GapCandidate,
  GapFeature,
  GapKind,
  GapWhyId,
  HueFamily,
  ItemSlot,
  LightBand,
  Likes,
  LookCounter,
  Palette,
  ReasonParams,
  StyleColour,
  StyleDay,
  StyleItem,
  StyleProfileInput,
} from "./types.js";

/** At most this many candidates are counted per run; a dismissal lasts this many days (Task B2 sets `until`). */
export const GAP_LIMITS = { candidates: 60, dismissDays: 90 } as const;

/** A rainy day, a cool day, and how many printed tops ask for a neutral bottom. */
export const GAP_RULES = { rainChance: 0.6, coolHighC: 22, busyTopsMin: 4 } as const;

/** The neutrals a gap may always try, and the colours for a closet with no palette yet. */
export const GAP_NEUTRALS = {
  always: ["black", "white", ...RULE_NEUTRALS],
  emptyPalette: ["black", "white", "denim"],
} as const satisfies Record<string, readonly string[]>;

/** The slots a piece gap can name, in the order gaps are generated. */
export const PIECE_GAP_SLOTS: readonly ItemSlot[] = [
  "TOP", "BOTTOM", "DRESS", "KURTA", "BLOUSE", "LAYER", "FOOTWEAR", "BAG", "DUPATTA",
];

/** The slots each day type dresses from. An empty slot a week's day types use is a gap. */
export const DAY_TYPE_SLOTS: Readonly<Record<DayType, readonly ItemSlot[]>> = {
  work: ["TOP", "BOTTOM", "DRESS", "KURTA", "LAYER", "FOOTWEAR", "BAG", "DUPATTA"],
  casual: ["TOP", "BOTTOM", "DRESS", "KURTA", "FOOTWEAR", "BAG"],
  evening: ["TOP", "BOTTOM", "DRESS", "FOOTWEAR", "BAG"],
  festive: ["KURTA", "SAREE", "BLOUSE", "DUPATTA", "FOOTWEAR", "BAG"],
  active: ["FOOTWEAR"],
};

/** The gap features a like can ask for. Showing the shoulders or legs has none. */
export type LikeGapFeature = "defines_waist" | "covers_arms" | "covers_legs" | "covers_midriff" | "covers_back" | "relaxed" | "fitted";

/** The like each gap feature answers, in the order like gaps are generated. */
export const LIKE_GAP_FEATURES: Readonly<Record<string, LikeGapFeature>> = {
  "define:waist": "defines_waist",
  "cover:arms": "covers_arms",
  "cover:legs": "covers_legs",
  "cover:midriff": "covers_midriff",
  "cover:back": "covers_back",
  "sit:relaxed": "relaxed",
  "sit:fitted": "fitted",
};

/** The slots a like gap can name for each feature. */
export const LIKE_GAP_SLOTS: Readonly<Record<LikeGapFeature, readonly ItemSlot[]>> = {
  defines_waist: ["DRESS", "KURTA", "TOP"],
  covers_arms: ["TOP", "KURTA", "LAYER"],
  covers_legs: ["BOTTOM", "DRESS"],
  covers_midriff: ["TOP", "BLOUSE"],
  covers_back: ["TOP", "DRESS", "BLOUSE"],
  relaxed: ["TOP", "BOTTOM", "DRESS", "KURTA"],
  fitted: ["TOP", "BOTTOM", "DRESS"],
};

/** An occasion the composer found no look for (Task B1). */
export interface OccasionGapInput {
  date: string;
  label: string;
  weekday: string;
  slot: ItemSlot;
  formality: number;
  festive: boolean;
}

/** Everything `findGaps` reads. Dates are ISO `YYYY-MM-DD`, compared as strings. */
export interface GapInput {
  items: readonly StyleItem[];
  palette: Palette;
  profile: StyleProfileInput | null;
  days: readonly StyleDay[];
  occasions: readonly OccasionGapInput[];
  dismissed: readonly { key: string; until: string }[];
  today: string;
}

const KINDS: readonly GapKind[] = ["occasion", "piece", "colour", "like"];
const DAY_TYPES: readonly DayType[] = ["work", "casual", "evening", "festive", "active"];
const ALL_SLOTS: readonly ItemSlot[] = [
  "TOP", "BOTTOM", "DRESS", "COORD_TOP", "COORD_BOTTOM", "JUMPSUIT", "SAREE", "BLOUSE", "KURTA", "DUPATTA", "LAYER",
  "ACTIVE_TOP", "ACTIVE_BOTTOM", "FOOTWEAR", "BAG", "EARRINGS", "NECKLACE", "BANGLES", "WATCH", "HAIR_ACCESSORY", "OTHER",
];
const SLOT_ORDER: readonly ItemSlot[] = [...PIECE_GAP_SLOTS, ...ALL_SLOTS.filter((s) => !PIECE_GAP_SLOTS.includes(s))];
const FEATURE_ORDER: readonly GapFeature[] = [
  "defines_waist", "rain_ok", "evening", "festive", "layer_warm",
  "covers_arms", "covers_legs", "covers_midriff", "covers_back", "relaxed", "fitted",
];

/** The contract's key: `${kind}:${slot}:${family}-${band ?? "any"}:${neutral ?? "-"}:${feature ?? "-"}`, plus `:${forDate}` for an occasion. */
export function gapKey(kind: GapKind, c: GapCandidate, forDate: string | null): string {
  const base = `${kind}:${c.slot}:${c.family}-${c.band ?? "any"}:${c.neutral ?? "-"}:${c.feature ?? "-"}`;
  return kind === "occasion" && forDate !== null ? `${base}:${forDate}` : base;
}

/**
 * What a dismissal matches: the key's kind, slot and feature (and an occasion's date), not its colour,
 * so a dismissed gap doesn't come back in the next colour.
 */
export function gapDismissKey(key: string): string {
  const [kind = "", slot = "", , , feature = "", date] = key.split(":");
  return kind === "occasion" ? `${kind}:${slot}:${feature}:${date ?? ""}` : `${kind}:${slot}:${feature}`;
}

interface GapColour {
  family: HueFamily;
  band: LightBand | null;
  neutral: string | null;
  /** A palette swatch or one of the palette's own neutrals. */
  own: boolean;
}

interface Raw {
  kind: GapKind;
  what: GapCandidate;
  why: { id: GapWhyId; params: ReasonParams };
  forDate: string | null;
  rank: number;
  key: string;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const slotOf = (item: StyleItem): ItemSlot | null => item.slot ?? item.attributes?.slot ?? null;
const familyOf = (c: StyleColour): HueFamily | null => paletteBinOf(c)?.family ?? (isNeutral(c) ? "neutral" : null);
const shareOf = (c: StyleColour): number => (typeof c.share === "number" && Number.isFinite(c.share) ? c.share : 0);

function familiesOf(item: StyleItem): Set<HueFamily> {
  const out = new Set<HueFamily>();
  for (const c of item.attributes?.colours ?? []) {
    const f = familyOf(c);
    if (f) out.add(f);
  }
  return out;
}

function mainColour(item: StyleItem): StyleColour | null {
  let best: StyleColour | null = null;
  for (const c of item.attributes?.colours ?? []) if (best === null || shareOf(c) > shareOf(best)) best = c;
  return best;
}

/** The colours gaps may try, in order: the palette, the heaviest swatch's ring neighbours, then other neutrals. */
function gapColours(palette: Palette): GapColour[] {
  const out: GapColour[] = [];
  const seen = new Set<string>();
  const add = (c: GapColour): void => {
    const k = `${c.family}-${c.band ?? "any"}:${c.neutral ?? "-"}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  };
  const neutral = (name: string, own: boolean): GapColour => ({ family: "neutral", band: null, neutral: name, own });
  if (palette.swatches.length === 0) {
    for (const n of GAP_NEUTRALS.emptyPalette) add(neutral(n, false));
    return out;
  }
  let ownNeutrals = false;
  const addOwnNeutrals = (): void => {
    if (ownNeutrals) return;
    ownNeutrals = true;
    for (const n of palette.neutrals) if (typeof n === "string" && n !== "") add(neutral(n, true));
  };
  for (const s of palette.swatches) {
    if (s.family === "neutral") addOwnNeutrals();
    else add({ family: s.family, band: s.band, neutral: null, own: true });
  }
  addOwnNeutrals();
  const top = palette.swatches.find((s) => s.family !== "neutral");
  if (top) for (const f of ringNeighbours(top.family)) add({ family: f, band: top.band, neutral: null, own: false });
  for (const n of GAP_NEUTRALS.always) add(neutral(n, false));
  return out;
}

/** The one-like profile a like gap checks pieces against. */
function singleLike(like: string): Likes {
  const [axis, value] = like.split(":") as [string, string];
  if (axis === "define") return { define: [value as Likes["define"][number]], cover: [], sit: "either" };
  if (axis === "cover") return { define: [], cover: [value as Likes["cover"][number]], sit: "either" };
  return { define: [], cover: [], sit: value as Likes["sit"] };
}

/** The like triggers set, as the rule set reads them: a zone in both lists is ignored, "either" sets none. */
function activeLikes(likes: Likes | null): Set<string> {
  const out = new Set<string>();
  if (!likes) return out;
  const define: readonly string[] = likes.define;
  const cover: readonly string[] = likes.cover;
  for (const zone of define) if (!cover.includes(zone)) out.add(`define:${zone}`);
  for (const zone of cover) if (!define.includes(zone)) out.add(`cover:${zone}`);
  if (likes.sit === "relaxed" || likes.sit === "fitted") out.add(`sit:${likes.sit}`);
  return out;
}

/**
 * The few missing pieces that would unlock the most new looks (spec §6.3), best first, one per kind and slot.
 * `countLooks` is called at most `GAP_LIMITS.candidates` times. No tagged pieces gives no gaps.
 */
export function findGaps(input: GapInput, countLooks: LookCounter, limit = 5): Gap[] {
  const tagged = input.items.filter((i) => i.attributes !== null);
  if (tagged.length === 0) return [];

  const colours = gapColours(input.palette);
  const raws: Raw[] = [];
  const push = (kind: GapKind, slot: ItemSlot, list: readonly GapColour[], feature: GapFeature | null, why: Raw["why"], forDate: string | null = null): void => {
    for (const c of list) {
      const what: GapCandidate = { slot, family: c.family, band: c.band, neutral: c.neutral, feature };
      raws.push({ kind, what, why, forDate, rank: colours.indexOf(c), key: gapKey(kind, what, forDate) });
    }
  };

  const occupied = new Set(input.items.map(slotOf));
  const ofSlot = (slot: ItemSlot): StyleItem[] => tagged.filter((i) => slotOf(i) === slot);
  const weekTypes = DAY_TYPES.filter((t) => input.days.some((d) => d.dayType === t));
  const usedBy = (slot: ItemSlot): DayType[] => weekTypes.filter((t) => DAY_TYPE_SLOTS[t].includes(slot));

  // Occasions the composer couldn't dress, from today on.
  const occasions = input.occasions
    .filter((o) => o.date >= input.today)
    .sort((a, b) => byCodeUnit(a.date, b.date) || byCodeUnit(a.label, b.label) || byCodeUnit(a.slot, b.slot));
  for (const o of occasions) {
    const why = { id: "OCCASION_NO_LOOK" as const, params: { label: o.label, weekday: o.weekday } };
    push("occasion", o.slot, colours.slice(0, 1), o.festive ? "festive" : "evening", why, o.date);
  }

  // Pieces the week needs.
  const rainy = input.days.some((d) => d.rainChance !== null && d.rainChance >= GAP_RULES.rainChance);
  const cool = input.days.some((d) => d.highC !== null && d.highC < GAP_RULES.coolHighC);
  const blouseFamilies = new Set(ofSlot("BLOUSE").flatMap((b) => [...familiesOf(b)]));
  const lonelySarees = ofSlot("SAREE").filter((s) => ![...familiesOf(s)].some((f) => blouseFamilies.has(f)));
  for (const slot of PIECE_GAP_SLOTS) {
    const empty = !occupied.has(slot);
    const used = usedBy(slot);
    const missing = { id: "SLOT_MISSING" as const, params: { slot, dayTypes: used.join(",") } };
    if (slot === "FOOTWEAR" && rainy && !ofSlot("FOOTWEAR").some((f) => f.attributes!.rainOk)) {
      push("piece", slot, colours, "rain_ok", { id: "RAIN_FOOTWEAR", params: {} });
    } else if (slot === "BLOUSE" && lonelySarees.length > 0) {
      const families = new Set(lonelySarees.flatMap((s) => [...familiesOf(s)]));
      const matching = colours.filter((c) => c.family !== "neutral" && families.has(c.family));
      const list = [...matching, ...colours.filter((c) => c.family === "neutral")];
      push("piece", slot, list, null, { id: "BLOUSE_FOR_SAREES", params: { count: lonelySarees.length } });
    } else if (slot === "LAYER" && empty && cool) {
      push("piece", slot, colours, "layer_warm", { id: "LAYER_COOL_MORNINGS", params: {} });
    } else if (empty && used.length > 0) {
      push("piece", slot, colours, null, missing);
    }
  }

  // Colours the closet lacks.
  const busyTops = ofSlot("TOP").filter((t) => t.attributes!.pattern !== "solid").length;
  const neutralBottom = ofSlot("BOTTOM").some((b) => {
    const main = mainColour(b);
    return main !== null && isNeutral(main);
  });
  if (busyTops >= GAP_RULES.busyTopsMin && !neutralBottom) {
    const why = { id: "NEUTRAL_BOTTOM_FOR_PRINTS" as const, params: { count: busyTops } };
    push("colour", "BOTTOM", colours.filter((c) => c.family === "neutral"), null, why);
  }
  const paletteFamilies = new Set(input.palette.swatches.map((s) => s.family));
  const eveningInPalette = tagged.some((i) => i.attributes!.eveningOk && [...familiesOf(i)].some((f) => paletteFamilies.has(f)));
  if (input.palette.swatches.length > 0 && !eveningInPalette) {
    push("colour", "DRESS", colours.filter((c) => c.own), "evening", { id: "EVENING_IN_COLOURS", params: {} });
  }

  // Likes no trusted piece meets on a day type the week has.
  const active = activeLikes(input.profile?.likes ?? null);
  const rulePieces: RulePiece[] = tagged
    .filter((i) => {
      const slot = slotOf(i);
      return slot !== null && BODY_RULE_SLOTS.has(slot);
    })
    .map((item) => ({ item, fabric: fabricOf(materialsOf(item)), lightness: null }));
  for (const [like, feature] of Object.entries(LIKE_GAP_FEATURES)) {
    if (!active.has(like)) continue;
    const single = singleLike(like);
    const meets = rulePieces.filter((p) => pieceRuleTerms(p, single, null).likes.score > 0).map((p) => slotOf(p.item));
    const unmet = weekTypes.filter(
      (t) => LIKE_GAP_SLOTS[feature].some((s) => DAY_TYPE_SLOTS[t].includes(s)) && !meets.some((s) => s !== null && DAY_TYPE_SLOTS[t].includes(s)),
    );
    for (const slot of LIKE_GAP_SLOTS[feature]) {
      const days = unmet.filter((t) => DAY_TYPE_SLOTS[t].includes(slot));
      if (days.length === 0) continue;
      push("like", slot, colours, feature, { id: "LIKE_UNMET", params: { feature, dayTypes: days.join(",") } });
    }
  }

  // Order: kind, slot, colour, feature; then drop repeats and live dismissals.
  const order = raws.map((r, i) => ({ r, i }));
  const slotIndex = (s: ItemSlot): number => SLOT_ORDER.indexOf(s);
  const featureIndex = (f: GapFeature | null): number => (f === null ? -1 : FEATURE_ORDER.indexOf(f));
  order.sort(
    (a, b) =>
      KINDS.indexOf(a.r.kind) - KINDS.indexOf(b.r.kind) ||
      slotIndex(a.r.what.slot) - slotIndex(b.r.what.slot) ||
      a.r.rank - b.r.rank ||
      featureIndex(a.r.what.feature) - featureIndex(b.r.what.feature) ||
      a.i - b.i,
  );
  const dismissed = new Set(
    input.dismissed.filter((d) => typeof d.until === "string" && d.until > input.today).map((d) => gapDismissKey(d.key)),
  );
  const seen = new Set<string>();
  const groups = new Map<string, Raw[]>();
  for (const { r } of order) {
    if (seen.has(r.key) || dismissed.has(gapDismissKey(r.key))) continue;
    seen.add(r.key);
    const group = `${r.kind}:${r.what.slot}`;
    const list = groups.get(group);
    if (list) list.push(r);
    else groups.set(group, [r]);
  }

  // Round-robin across kind and slot, so each one's first colour is counted before any second.
  const counted: Gap[] = [];
  const lists = [...groups.values()];
  let budget: number = GAP_LIMITS.candidates;
  for (let round = 0; budget > 0; round++) {
    const batch = lists.filter((l) => l.length > round).map((l) => l[round]!);
    if (batch.length === 0) break;
    for (const r of batch.slice(0, budget)) {
      const unlocks = countLooks(r.what);
      if (Number.isFinite(unlocks) && unlocks > 0) {
        counted.push({ key: r.key, kind: r.kind, what: r.what, unlocks, why: r.why, forDate: r.forDate });
      }
    }
    budget -= batch.length;
  }

  // Best first: kind, more unlocks, sooner, the palette's own colour, then the key.
  const rankOf = new Map(raws.map((r) => [r.key, r.rank]));
  counted.sort(
    (a, b) =>
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
      b.unlocks - a.unlocks ||
      (a.forDate === b.forDate ? 0 : a.forDate === null ? 1 : b.forDate === null ? -1 : byCodeUnit(a.forDate, b.forDate)) ||
      rankOf.get(a.key)! - rankOf.get(b.key)! ||
      byCodeUnit(a.key, b.key),
  );
  const kept = new Set<string>();
  const out: Gap[] = [];
  for (const g of counted) {
    const group = `${g.kind}:${g.what.slot}`;
    if (kept.has(group)) continue;
    kept.add(group);
    out.push(g);
  }
  return out.slice(0, Math.max(0, limit));
}
