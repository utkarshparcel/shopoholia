import { MATERIAL_NAMES } from "../fabrics.js";
import type { BlendedFabric } from "../fabrics.js";
import { shape } from "../fields.js";
import { ZERO_TERM } from "../types.js";
import type {
  CoverLike,
  ItemSlot,
  Likes,
  Proportions,
  ReasonParams,
  StyleAttributes,
  StyleItem,
  StyleReason,
  StyleReasonId,
  Term,
} from "../types.js";

/** One piece as the rules see it. `lightness` is the main colour's OKLCH L, supplied by the caller. */
export interface RulePiece {
  item: StyleItem;
  fabric: BlendedFabric | null;
  lightness: number | null;
}

/** What a rule pushes: +1 draws attention to or shows the zone, −1 covers or quiets it. */
export type Axis = "waist" | "shoulders" | "legs" | "arms" | "midriff" | "back" | "sit";

/** One row of the rule set (spec §5.2). A row is either like-triggered or proportion-triggered. */
export interface BodyRule {
  id: StyleReasonId;
  /** A like as `define:<zone>`, `cover:<zone>` or `sit:<relaxed|fitted>`, or a proportion bucket. */
  trigger: { like: string } | { proportion: keyof Proportions; is: string };
  axes: Partial<Record<Axis, 1 | -1>>;
  scope: "piece" | "look";
  /**
   * Called with the one piece (scope "piece") or the whole look. Returns score 1 on a match and −1 on a
   * clear opposite, with the reason's params; `pieceRuleTerms` and `lookRuleTerms` scale it.
   */
  match: (pieces: readonly RulePiece[]) => { score: number; params: ReasonParams } | null;
}

/** Every number the rules use. Starting values for the stylist to tune. */
export const BODY_RULE_NUMBERS = {
  /** A like row scores this on a match and minus this on a clear opposite. */
  like: 0.5,
  /** A proportion row scores this × the bucket's confidence on a match, and never scores down. */
  proportion: 0.5,
  /** INTEREST_ABOVE: how much darker (OKLCH L) a busy bottom must be than the top. */
  darkerBy: 0.15,
  /** EASY_FIT: the most cling a fabric may have. */
  easyClingMax: 2,
  /** CLEAN_LINE: the most drape a fabric may have. */
  cleanDrapeMax: 2,
} as const;

/** The slots the women's rule set covers (spec §3.4). Other pieces are ranked without body rules. */
export const BODY_RULE_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>([
  "TOP", "BOTTOM", "DRESS", "COORD_TOP", "COORD_BOTTOM", "JUMPSUIT", "SAREE", "BLOUSE", "KURTA", "LAYER",
]);

/** The values and subtype words each row matches. Starting values for the stylist to review. */
export const RULE_VALUES = {
  defineWaistFits: ["defined", "fitted", "ruched"],
  defineSilhouettes: ["a_line", "fitted"],
  waistTieWords: ["wrap", "wrapped", "belt", "belted", "tie", "tied", "ties"],
  skimSilhouettes: ["straight", "relaxed", "a_line"],
  looseFits: ["relaxed", "unstructured"],
  skimWords: ["empire"],
  flareSilhouettes: ["a_line", "flowy"],
  flareWords: ["wide", "flare", "flared", "anarkali", "lehenga", "palazzo", "sharara", "gharara"],
  openNecklines: ["v", "scoop"],
  interestNecklines: ["off_shoulder", "collar"],
  boatWords: ["boat", "bateau"],
  shortTopLengths: ["cropped", "waist"],
  tuckKurtaLengths: ["hip", "thigh", "knee"],
  longTopLengths: ["thigh", "knee", "calf"],
  armsCovered: ["elbow", "three_quarter", "long"],
  armsBare: ["sleeveless", "strapless", "cap"],
  legsCovered: ["midi", "ankle", "floor", "trousers"],
  legsBare: ["above_knee"],
  legsShown: ["above_knee", "knee"],
  shoulderNecklines: ["off_shoulder", "one_shoulder"],
  easySilhouettes: ["relaxed", "oversized", "flowy"],
  cleanSilhouettes: ["fitted", "bodycon"],
} as const satisfies Record<string, readonly string[]>;

/** Which pieces play which part in a look. */
const ROLE = {
  /** VOLUME_BELOW: the pieces that can carry the flare. */
  flare: ["BOTTOM", "COORD_BOTTOM", "DRESS", "JUMPSUIT", "KURTA", "SAREE"],
  /** VOLUME_BELOW: the pieces whose neckline and shoulders count. */
  neckline: ["TOP", "COORD_TOP", "BLOUSE", "KURTA", "DRESS", "JUMPSUIT"],
  /** INTEREST_ABOVE: a separate top over a separate bottom. */
  upper: ["TOP", "COORD_TOP", "BLOUSE", "KURTA"],
  lower: ["BOTTOM", "COORD_BOTTOM", "SAREE"],
  /** HIGH_RISE and LONG_TOP. */
  rise: ["BOTTOM", "COORD_BOTTOM"],
  shortTop: ["TOP", "COORD_TOP", "BLOUSE"],
  longTop: ["TOP", "COORD_TOP", "KURTA"],
} as const satisfies Record<string, readonly ItemSlot[]>;

const V = RULE_VALUES;
const N = BODY_RULE_NUMBERS;
/** Absorbs float error in lightness differences ("0.70 − 0.55" is 0.1499…). */
const EPSILON = 1e-9;

type Hit = { score: number; params: ReasonParams } | null;
const hit = (params: ReasonParams = {}): Hit => ({ score: 1, params });
const OPPOSITE: Hit = { score: -1, params: {} };

const isOneOf = <T extends string>(value: T | undefined, list: readonly string[]): value is T =>
  value !== undefined && list.includes(value);
const slotOf = (p: RulePiece): ItemSlot | null => p.item.slot ?? p.item.attributes?.slot ?? null;
const inRole = (p: RulePiece, slots: readonly ItemSlot[]): boolean => {
  const slot = slotOf(p);
  return slot !== null && slots.includes(slot);
};
const subtypeWords = (p: RulePiece): string[] =>
  (p.item.attributes?.subtype ?? "").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w !== "");
const hasWord = (p: RulePiece, list: readonly string[]): boolean => subtypeWords(p).some((w) => list.includes(w));
/** `{piece}`: the subtype's last word ("wrap dress" → "dress"). */
const pieceWord = (p: RulePiece): string => subtypeWords(p).at(-1) ?? "piece";
const materialName = (f: BlendedFabric): string => MATERIAL_NAMES[f.parts[0]!.material];
const volumeAt = (p: RulePiece): readonly string[] => shape(p.item, "volumeAt") ?? [];

/** Wraps a piece-scope match so it runs only on a tagged piece. */
function onPiece(fn: (p: RulePiece, a: StyleAttributes) => Hit): BodyRule["match"] {
  return (pieces) => {
    const p = pieces[0];
    const a = p?.item.attributes;
    return p && a ? fn(p, a) : null;
  };
}

/** `how`: "ties" only when the subtype names a tie or belt; a fit or silhouette match is "shaped". */
const definesWaist = onPiece((p) => {
  if (hasWord(p, V.waistTieWords)) return hit({ piece: pieceWord(p), how: "ties" });
  if (isOneOf(shape(p.item, "fit.waist"), V.defineWaistFits) || isOneOf(shape(p.item, "silhouette"), V.defineSilhouettes)) {
    return hit({ piece: pieceWord(p), how: "shaped" });
  }
  return shape(p.item, "silhouette") === "oversized" ? OPPOSITE : null;
});

const skimsWaist = onPiece((p) =>
  isOneOf(shape(p.item, "silhouette"), V.skimSilhouettes) ||
  isOneOf(shape(p.item, "fit.waist"), V.looseFits) ||
  hasWord(p, V.skimWords)
    ? hit({ piece: pieceWord(p) })
    : null,
);

function volumeBelow(look: readonly RulePiece[]): Hit {
  const flared = look.find(
    (p) => inRole(p, ROLE.flare) && (isOneOf(shape(p.item, "silhouette"), V.flareSilhouettes) || hasWord(p, V.flareWords)),
  );
  if (!flared) return null;
  const tops = look.filter((p) => inRole(p, ROLE.neckline));
  const open = tops.some((p) => isOneOf(p.item.attributes?.neckline, V.openNecklines));
  const plainShoulders = tops.every((p) => !volumeAt(p).includes("shoulders"));
  return open && plainShoulders ? hit({ piece: pieceWord(flared) }) : null;
}

function detailAbove(p: RulePiece): string | null {
  const a = p.item.attributes;
  if (!a) return null;
  if (isOneOf(a.neckline, V.interestNecklines) || hasWord(p, V.boatWords)) return "neckline";
  if (volumeAt(p).some((v) => v === "shoulders" || v === "sleeves")) return "sleeves";
  return a.pattern === "embroidered" ? "embroidery" : null;
}

function interestAbove(look: readonly RulePiece[]): Hit {
  const bottoms = look.filter((p) => inRole(p, ROLE.lower));
  for (const top of look.filter((p) => inRole(p, ROLE.upper))) {
    const detail = detailAbove(top);
    if (!detail) continue;
    const quiet = bottoms.some(
      (b) =>
        b.item.attributes?.pattern === "solid" ||
        (top.lightness !== null && b.lightness !== null && top.lightness - b.lightness >= N.darkerBy - EPSILON),
    );
    if (quiet) return hit({ detail });
  }
  return null;
}

/** `over`: what sits over the high rise, a short top (preferred) or a kurta. */
function highRise(look: readonly RulePiece[]): Hit {
  if (!look.some((p) => inRole(p, ROLE.rise) && shape(p.item, "rise") === "high")) return null;
  if (look.some((p) => inRole(p, ROLE.shortTop) && isOneOf(shape(p.item, "length"), V.shortTopLengths))) {
    return hit({ over: "top" });
  }
  return look.some((p) => slotOf(p) === "KURTA" && isOneOf(shape(p.item, "length"), V.tuckKurtaLengths))
    ? hit({ over: "kurta" })
    : null;
}

/** `via`: "top" when a top or kurta runs long (with `top` naming it), else "rise" for a mid rise. */
function longTop(look: readonly RulePiece[]): Hit {
  const long = look.find((p) => inRole(p, ROLE.longTop) && isOneOf(shape(p.item, "length"), V.longTopLengths));
  if (long) return hit({ via: "top", top: slotOf(long) === "KURTA" ? "kurta" : "top" });
  return look.some((p) => inRole(p, ROLE.rise) && shape(p.item, "rise") === "mid") ? hit({ via: "rise" }) : null;
}

const COVER_MATCH: Readonly<Record<CoverLike, BodyRule["match"]>> = {
  arms: onPiece((_p, a) =>
    isOneOf(a.sleeve, V.armsCovered) ? hit({ zone: "arms", sleeve: a.sleeve }) : isOneOf(a.sleeve, V.armsBare) ? OPPOSITE : null,
  ),
  midriff: onPiece((p) => {
    const v = shape(p.item, "coverage.midriff");
    return v === "covered" ? hit({ zone: "midriff" }) : v === "bare" ? OPPOSITE : null;
  }),
  legs: onPiece((p) => {
    const v = shape(p.item, "coverage.legs");
    return isOneOf(v, V.legsCovered) ? hit({ zone: "legs" }) : isOneOf(v, V.legsBare) ? OPPOSITE : null;
  }),
  back: onPiece((p) => {
    const v = shape(p.item, "coverage.back");
    return v === "covered" ? hit({ zone: "back" }) : v === "bare" ? OPPOSITE : null;
  }),
};

function layerCoversArms(look: readonly RulePiece[]): Hit {
  for (const p of look) {
    const sleeve = p.item.attributes?.sleeve;
    if (slotOf(p) === "LAYER" && isOneOf(sleeve, V.armsCovered)) return hit({ zone: "arms", sleeve });
  }
  return null;
}

const showsShoulders = onPiece((p, a) => {
  if (isOneOf(a.neckline, V.shoulderNecklines)) return hit({ neckline: a.neckline });
  return volumeAt(p).includes("shoulders") ? hit() : null;
});

const showsLegs = onPiece((p) => {
  const v = shape(p.item, "coverage.legs");
  return isOneOf(v, V.legsShown) ? hit({ length: v }) : null;
});

const easyFit = onPiece((p) => {
  const silhouette = shape(p.item, "silhouette");
  const waist = shape(p.item, "fit.waist");
  const hip = shape(p.item, "fit.hip");
  if (isOneOf(silhouette, V.easySilhouettes) || isOneOf(waist, V.looseFits) || isOneOf(hip, V.looseFits)) {
    if (!p.fabric) return hit();
    return p.fabric.profile.cling <= N.easyClingMax ? hit({ material: materialName(p.fabric) }) : null;
  }
  return silhouette === "bodycon" || waist === "bodycon" || hip === "bodycon" ? OPPOSITE : null;
});

const cleanLine = onPiece((p) => {
  const silhouette = shape(p.item, "silhouette");
  if (isOneOf(silhouette, V.cleanSilhouettes) || shape(p.item, "fit.waist") === "fitted") {
    return p.fabric && p.fabric.profile.drape <= N.cleanDrapeMax ? hit({ material: materialName(p.fabric) }) : null;
  }
  return silhouette === "oversized" ? OPPOSITE : null;
});

/** The women's rule set as data (spec §5.2, plan Task A2). Rows run in this order. */
export const WOMEN_RULES: readonly BodyRule[] = [
  { id: "DEFINES_WAIST", trigger: { like: "define:waist" }, axes: { waist: 1 }, scope: "piece", match: definesWaist },
  { id: "DEFINES_WAIST", trigger: { proportion: "waist", is: "defined" }, axes: { waist: 1 }, scope: "piece", match: definesWaist },
  { id: "SKIMS_WAIST", trigger: { proportion: "waist", is: "straight" }, axes: { waist: -1 }, scope: "piece", match: skimsWaist },
  { id: "VOLUME_BELOW", trigger: { proportion: "balance", is: "top_wider" }, axes: { shoulders: -1 }, scope: "look", match: volumeBelow },
  { id: "INTEREST_ABOVE", trigger: { proportion: "balance", is: "bottom_wider" }, axes: { shoulders: 1 }, scope: "look", match: interestAbove },
  { id: "HIGH_RISE", trigger: { proportion: "torso", is: "longer_torso" }, axes: { legs: 1 }, scope: "look", match: highRise },
  { id: "LONG_TOP", trigger: { proportion: "torso", is: "longer_legs" }, axes: { legs: -1 }, scope: "look", match: longTop },
  { id: "COVERS", trigger: { like: "cover:arms" }, axes: { arms: -1 }, scope: "piece", match: COVER_MATCH.arms },
  { id: "COVERS", trigger: { like: "cover:midriff" }, axes: { midriff: -1 }, scope: "piece", match: COVER_MATCH.midriff },
  { id: "COVERS", trigger: { like: "cover:legs" }, axes: { legs: -1 }, scope: "piece", match: COVER_MATCH.legs },
  { id: "COVERS", trigger: { like: "cover:back" }, axes: { back: -1 }, scope: "piece", match: COVER_MATCH.back },
  { id: "COVERS", trigger: { like: "cover:arms" }, axes: { arms: -1 }, scope: "look", match: layerCoversArms },
  { id: "SHOWS_SHOULDERS", trigger: { like: "define:shoulders" }, axes: { shoulders: 1 }, scope: "piece", match: showsShoulders },
  { id: "SHOWS_LEGS", trigger: { like: "define:legs" }, axes: { legs: 1 }, scope: "piece", match: showsLegs },
  { id: "EASY_FIT", trigger: { like: "sit:relaxed" }, axes: { sit: -1 }, scope: "piece", match: easyFit },
  { id: "CLEAN_LINE", trigger: { like: "sit:fitted" }, axes: { sit: 1 }, scope: "piece", match: cleanLine },
];

/** The like triggers the user's likes set. A zone in both define and cover is ignored for both; "either" sets none. */
function activeLikes(likes: Likes | null): ReadonlySet<string> {
  const out = new Set<string>();
  if (!likes) return out;
  const define: readonly string[] = likes.define;
  const cover: readonly string[] = likes.cover;
  for (const zone of define) if (!cover.includes(zone)) out.add(`define:${zone}`);
  for (const zone of cover) if (!define.includes(zone)) out.add(`cover:${zone}`);
  if (likes.sit === "relaxed" || likes.sit === "fitted") out.add(`sit:${likes.sit}`);
  return out;
}

/** The signs the active like rows push on each axis, whether or not a piece matches them. */
function likedAxes(active: ReadonlySet<string>): ReadonlyMap<string, ReadonlySet<number>> {
  const out = new Map<string, Set<number>>();
  for (const rule of WOMEN_RULES) {
    if (!("like" in rule.trigger) || !active.has(rule.trigger.like)) continue;
    for (const [axis, sign] of Object.entries(rule.axes)) {
      out.set(axis, (out.get(axis) ?? new Set<number>()).add(sign));
    }
  }
  return out;
}

const term = (score: number, reasons: StyleReason[]): Term =>
  reasons.length === 0 && score === 0 ? ZERO_TERM : { score: Math.max(-1, Math.min(1, score)), reasons };

function evaluate(
  scope: BodyRule["scope"],
  pieces: readonly RulePiece[],
  likes: Likes | null,
  proportions: Proportions | null,
): { likes: Term; proportion: Term } {
  const active = activeLikes(likes);
  const liked = likedAxes(active);
  const likeReasons: StyleReason[] = [];
  const proportionReasons: StyleReason[] = [];
  let likeScore = 0;
  let proportionScore = 0;
  for (const rule of WOMEN_RULES) {
    if (rule.scope !== scope) continue;
    const trigger = rule.trigger;
    if ("like" in trigger) {
      if (!active.has(trigger.like)) continue;
      const m = rule.match(pieces);
      if (!m) continue;
      const s = m.score * N.like;
      likeScore += s;
      if (s > 0) likeReasons.push({ id: rule.id, strength: s, params: m.params });
    } else {
      const bucket = proportions?.[trigger.proportion];
      if (!bucket || bucket.value !== trigger.is) continue;
      // Likes beat proportions: a row that pushes against a like on any axis gives way.
      if (Object.entries(rule.axes).some(([axis, sign]) => liked.get(axis)?.has(-sign))) continue;
      const m = rule.match(pieces);
      const s = m ? m.score * N.proportion * bucket.confidence : 0;
      if (!m || !(s > 0)) continue;
      proportionScore += s;
      proportionReasons.push({ id: rule.id, strength: s, params: m.params });
    }
  }
  return { likes: term(likeScore, likeReasons), proportion: term(proportionScore, proportionReasons) };
}

const NO_TERMS: { likes: Term; proportion: Term } = { likes: ZERO_TERM, proportion: ZERO_TERM };

/** A tagged piece in a slot the rule set covers. */
const ruled = (p: RulePiece): boolean => {
  const slot = slotOf(p);
  return p.item.attributes !== null && slot !== null && BODY_RULE_SLOTS.has(slot);
};

/** The piece-scope rows for one piece: the like rows into `likes`, the proportion rows into `proportion`. */
export function pieceRuleTerms(
  p: RulePiece,
  likes: Likes | null,
  proportions: Proportions | null,
): { likes: Term; proportion: Term } {
  if (!ruled(p)) return NO_TERMS;
  return evaluate("piece", [p], likes, proportions);
}

/** The look-scope rows (balance, tucking, a layer that covers) over the look's pieces. */
export function lookRuleTerms(
  look: readonly RulePiece[],
  likes: Likes | null,
  proportions: Proportions | null,
): { likes: Term; proportion: Term } {
  const pieces = look.filter(ruled);
  return pieces.length === 0 ? NO_TERMS : evaluate("look", pieces, likes, proportions);
}
