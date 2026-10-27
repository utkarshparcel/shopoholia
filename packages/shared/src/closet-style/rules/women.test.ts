import { describe, expect, it } from "vitest";
import { fabricOf } from "../fabrics.js";
import type {
  Bucket,
  ItemSlot,
  Likes,
  Proportions,
  StyleAttributes,
  StyleItem,
  StyleReasonId,
  Term,
} from "../types.js";
import { BODY_RULE_NUMBERS, WOMEN_RULES, lookRuleTerms, pieceRuleTerms } from "./women.js";
import type { Axis, RulePiece } from "./women.js";

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

interface PieceOpts {
  materials?: string[];
  lightness?: number | null;
  /** Tag every shape field at this model confidence instead of marking the item user-set. */
  trust?: number;
}

/** A piece the user tagged (so every shape field is trusted), unless `trust` sets a model confidence. */
function piece(slot: ItemSlot, a: Partial<StyleAttributes> = {}, opts: PieceOpts = {}): RulePiece {
  const materials = opts.materials ?? [];
  const confidence =
    opts.trust === undefined
      ? {}
      : { silhouette: opts.trust, fit: opts.trust, coverage: opts.trust, rise: opts.trust, length: opts.trust, volumeAt: opts.trust };
  const item: StyleItem = {
    id: `${slot}:${a.subtype ?? ""}`,
    slot,
    materials,
    attributes: { ...BASE, slot, ...a, materials, confidence },
    attributesSource: opts.trust === undefined ? "USER" : "MODEL",
    attributesConfirmed: {},
  };
  return { item, fabric: fabricOf(materials), lightness: opts.lightness ?? null };
}

const likes = (over: Partial<Likes> = {}): Likes => ({ define: [], cover: [], sit: "either", ...over });
const bucket = <V extends string>(value: V, confidence = 1): Bucket<V> => ({
  value,
  confidence,
  source: confidence === 1 ? "TAPE" : "PHOTO",
});
const props = (over: Partial<Proportions> = {}): Proportions => ({ waist: null, balance: null, torso: null, ...over });
const ids = (t: Term): StyleReasonId[] => t.reasons.map((r) => r.id);

/** Piece-scope like terms for one piece. */
const likeScore = (p: RulePiece, l: Partial<Likes>) => pieceRuleTerms(p, likes(l), null).likes;
/** Piece-scope proportion terms for one piece. */
const propScore = (p: RulePiece, pr: Partial<Proportions>) => pieceRuleTerms(p, null, props(pr)).proportion;
/** Look-scope proportion terms. */
const lookProp = (look: RulePiece[], pr: Partial<Proportions>, l: Likes | null = null) =>
  lookRuleTerms(look, l, props(pr)).proportion;

describe("the women's rule set", () => {
  it("has one row per trigger, each with a known axis and scope", () => {
    const rows = WOMEN_RULES.map((r) => {
      const t = "like" in r.trigger ? r.trigger.like : `${r.trigger.proportion}=${r.trigger.is}`;
      return `${r.id} ${r.scope} ${t}`;
    });
    expect(rows).toEqual([
      "DEFINES_WAIST piece define:waist",
      "DEFINES_WAIST piece waist=defined",
      "SKIMS_WAIST piece waist=straight",
      "VOLUME_BELOW look balance=top_wider",
      "INTEREST_ABOVE look balance=bottom_wider",
      "HIGH_RISE look torso=longer_torso",
      "LONG_TOP look torso=longer_legs",
      "COVERS piece cover:arms",
      "COVERS piece cover:midriff",
      "COVERS piece cover:legs",
      "COVERS piece cover:back",
      "COVERS look cover:arms",
      "SHOWS_SHOULDERS piece define:shoulders",
      "SHOWS_LEGS piece define:legs",
      "EASY_FIT piece sit:relaxed",
      "CLEAN_LINE piece sit:fitted",
    ]);
    const axes = new Set<Axis>(["waist", "shoulders", "legs", "arms", "midriff", "back", "sit"]);
    for (const r of WOMEN_RULES) {
      expect(Object.keys(r.axes).length).toBe(1);
      for (const a of Object.keys(r.axes)) expect(axes.has(a as Axis)).toBe(true);
    }
  });
});

describe("rule rows", () => {
  it("DEFINES_WAIST from the like: waist fit, silhouette or a tie, and oversized as the opposite", () => {
    const l = { define: ["waist"] as const };
    expect(likeScore(piece("DRESS", { subtype: "midi dress", fit: { waist: "defined" } }), { define: ["waist"] })).toEqual({
      score: 0.5,
      reasons: [{ id: "DEFINES_WAIST", strength: 0.5, params: { piece: "dress", how: "shaped" } }],
    });
    expect(likeScore(piece("TOP", { fit: { waist: "ruched" } }), l).score).toBe(0.5);
    expect(likeScore(piece("TOP", { fit: { waist: "fitted" } }), l).score).toBe(0.5);
    expect(likeScore(piece("DRESS", { silhouette: "a_line" }), l).score).toBe(0.5);
    expect(likeScore(piece("DRESS", { silhouette: "fitted" }), l).score).toBe(0.5);
    // The subtype is not a shape field, so it reads even when the shape fields are untrusted.
    expect(likeScore(piece("DRESS", { subtype: "Wrap Dress" }, { trust: 0.1 }), l).reasons[0]?.params).toEqual({
      piece: "dress",
      how: "ties",
    });
    // Only a named tie or belt says "ties"; a fit or silhouette match says "shaped".
    expect(likeScore(piece("DRESS", { silhouette: "a_line" }), l).reasons[0]?.params).toEqual({ piece: "piece", how: "shaped" });
    expect(likeScore(piece("KURTA", { subtype: "belted kurta" }), l).score).toBe(0.5);
    expect(likeScore(piece("TOP", { subtype: "tie-front shirt" }), l).score).toBe(0.5);
    // "tiered" is not a tie.
    expect(likeScore(piece("BOTTOM", { subtype: "tiered skirt" }), l).score).toBe(0);
    expect(likeScore(piece("TOP", { silhouette: "straight" }), l).score).toBe(0);
    expect(likeScore(piece("TOP", { silhouette: "oversized" }), l)).toEqual({ score: -0.5, reasons: [] });
    // The like alone does not fire the proportion row.
    expect(pieceRuleTerms(piece("DRESS", { silhouette: "a_line" }), likes(l), null).proportion.score).toBe(0);
  });

  it("DEFINES_WAIST from a defined waist: scales by confidence and never scores down", () => {
    const dress = piece("DRESS", { subtype: "wrap dress" });
    expect(propScore(dress, { waist: bucket("defined") })).toEqual({
      score: 0.5,
      reasons: [{ id: "DEFINES_WAIST", strength: 0.5, params: { piece: "dress", how: "ties" } }],
    });
    expect(propScore(dress, { waist: bucket("defined", 0.7) }).score).toBeCloseTo(0.35);
    expect(propScore(dress, { waist: bucket("moderate") }).score).toBe(0);
    expect(propScore(piece("TOP", { silhouette: "oversized" }), { waist: bucket("defined") })).toEqual({ score: 0, reasons: [] });
    expect(pieceRuleTerms(dress, null, props({ waist: bucket("defined") })).likes.score).toBe(0);
  });

  it("SKIMS_WAIST from a straight waist: straight, relaxed or a-line, a loose waist, or an empire line", () => {
    const w = { waist: bucket("straight") };
    expect(propScore(piece("DRESS", { subtype: "shift dress", silhouette: "straight" }), w)).toEqual({
      score: 0.5,
      reasons: [{ id: "SKIMS_WAIST", strength: 0.5, params: { piece: "dress" } }],
    });
    expect(propScore(piece("TOP", { silhouette: "relaxed" }), w).score).toBe(0.5);
    expect(propScore(piece("DRESS", { silhouette: "a_line" }), w).score).toBe(0.5);
    expect(propScore(piece("TOP", { fit: { waist: "relaxed" } }), w).score).toBe(0.5);
    expect(propScore(piece("TOP", { fit: { waist: "unstructured" } }), w).score).toBe(0.5);
    expect(propScore(piece("DRESS", { subtype: "empire maxi" }), w).reasons[0]?.params).toEqual({ piece: "maxi" });
    expect(propScore(piece("DRESS", { silhouette: "bodycon" }), w)).toEqual({ score: 0, reasons: [] });
    expect(propScore(piece("DRESS", { silhouette: "straight" }), { waist: bucket("straight", 0.35) }).score).toBeCloseTo(0.175);
  });

  it("VOLUME_BELOW from top-wider: a flared lower piece under a v or scoop neckline with plain shoulders", () => {
    const b = { balance: bucket("top_wider") };
    const vTop = piece("TOP", { neckline: "v" });
    expect(lookProp([vTop, piece("BOTTOM", { subtype: "a-line skirt", silhouette: "a_line" })], b)).toEqual({
      score: 0.5,
      reasons: [{ id: "VOLUME_BELOW", strength: 0.5, params: { piece: "skirt" } }],
    });
    expect(lookProp([vTop, piece("BOTTOM", { subtype: "wide-leg trousers" })], b).reasons[0]?.params).toEqual({ piece: "trousers" });
    expect(lookProp([piece("BLOUSE", { neckline: "scoop" }), piece("BOTTOM", { subtype: "lehenga" })], b).score).toBe(0.5);
    expect(lookProp([piece("KURTA", { subtype: "anarkali kurta", neckline: "v" })], b).score).toBe(0.5);
    expect(lookProp([piece("DRESS", { subtype: "maxi dress", silhouette: "flowy", neckline: "scoop" })], b).score).toBe(0.5);
    expect(lookProp([vTop, piece("BOTTOM", { subtype: "flared jeans" })], b).score).toBe(0.5);
    // Not a match: no flare, a crew neckline, or volume at the shoulders.
    expect(lookProp([vTop, piece("BOTTOM", { subtype: "slim trousers", silhouette: "straight" })], b).score).toBe(0);
    expect(lookProp([piece("TOP", { neckline: "crew" }), piece("BOTTOM", { silhouette: "a_line" })], b).score).toBe(0);
    expect(lookProp([piece("TOP", { neckline: "v", volumeAt: ["shoulders"] }), piece("BOTTOM", { silhouette: "a_line" })], b).score).toBe(0);
    expect(lookProp([vTop, piece("BOTTOM", { silhouette: "a_line" })], { balance: bucket("balanced") }).score).toBe(0);
  });

  it("INTEREST_ABOVE from bottom-wider: detail on the top over a solid or darker bottom", () => {
    const b = { balance: bucket("bottom_wider") };
    const solid = piece("BOTTOM", { pattern: "solid" });
    expect(lookProp([piece("TOP", { neckline: "off_shoulder" }), solid], b)).toEqual({
      score: 0.5,
      reasons: [{ id: "INTEREST_ABOVE", strength: 0.5, params: { detail: "neckline" } }],
    });
    expect(lookProp([piece("TOP", { neckline: "collar" }), solid], b).reasons[0]?.params).toEqual({ detail: "neckline" });
    expect(lookProp([piece("TOP", { subtype: "boat neck top", neckline: "other" }), solid], b).reasons[0]?.params).toEqual({ detail: "neckline" });
    expect(lookProp([piece("TOP", { volumeAt: ["sleeves"] }), solid], b).reasons[0]?.params).toEqual({ detail: "sleeves" });
    expect(lookProp([piece("TOP", { volumeAt: ["shoulders"] }), solid], b).reasons[0]?.params).toEqual({ detail: "sleeves" });
    const embroidered = piece("BLOUSE", { pattern: "embroidered" }, { lightness: 0.7 });
    expect(lookProp([embroidered, piece("SAREE", { pattern: "floral" }, { lightness: 0.55 })], b).reasons[0]?.params).toEqual({ detail: "embroidery" });
    // A busy bottom that is not dark enough, a plain top, or no bottom: no match.
    expect(lookProp([embroidered, piece("SAREE", { pattern: "floral" }, { lightness: 0.56 })], b).score).toBe(0);
    expect(lookProp([embroidered, piece("SAREE", { pattern: "floral" }, { lightness: null })], b).score).toBe(0);
    expect(lookProp([piece("TOP", { neckline: "crew" }), solid], b).score).toBe(0);
    expect(lookProp([piece("TOP", { neckline: "off_shoulder" })], b).score).toBe(0);
  });

  it("HIGH_RISE from a longer torso: a high rise under a short top or a hip-to-knee kurta", () => {
    const t = { torso: bucket("longer_torso", 0.7) };
    const high = piece("BOTTOM", { rise: "high" });
    expect(lookProp([piece("TOP", { length: "cropped" }), high], t)).toEqual({
      score: 0.35,
      reasons: [{ id: "HIGH_RISE", strength: 0.35, params: { over: "top" } }],
    });
    expect(lookProp([piece("TOP", { length: "waist" }), high], t).score).toBeCloseTo(0.35);
    expect(lookProp([piece("KURTA", { length: "knee" }), high], t).score).toBeCloseTo(0.35);
    expect(lookProp([piece("KURTA", { length: "knee" }), high], t).reasons[0]?.params).toEqual({ over: "kurta" });
    expect(lookProp([piece("KURTA", { length: "knee" }), piece("TOP", { length: "cropped" }), high], t).reasons[0]?.params).toEqual({
      over: "top",
    });
    expect(lookProp([piece("KURTA", { length: "hip" }), high], t).score).toBeCloseTo(0.35);
    expect(lookProp([piece("TOP", { length: "hip" }), high], t).score).toBe(0);
    expect(lookProp([piece("KURTA", { length: "calf" }), high], t).score).toBe(0);
    expect(lookProp([piece("TOP", { length: "cropped" }), piece("BOTTOM", { rise: "mid" })], t).score).toBe(0);
  });

  it("LONG_TOP from longer legs: a mid rise, or a top or kurta from thigh to calf", () => {
    const t = { torso: bucket("longer_legs") };
    expect(lookProp([piece("KURTA", { length: "calf" }), piece("BOTTOM", { rise: "low" })], t)).toEqual({
      score: 0.5,
      reasons: [{ id: "LONG_TOP", strength: 0.5, params: { via: "top", top: "kurta" } }],
    });
    expect(lookProp([piece("TOP", { length: "waist" }), piece("BOTTOM", { rise: "mid" })], t).reasons[0]?.params).toEqual({ via: "rise" });
    // `top` names the long piece, not any kurta in the look.
    expect(lookProp([piece("KURTA", { length: "hip" }), piece("TOP", { length: "knee" })], t).reasons[0]?.params).toEqual({
      via: "top",
      top: "top",
    });
    expect(lookProp([piece("TOP", { length: "thigh" }), piece("BOTTOM", {})], t).score).toBe(0.5);
    expect(lookProp([piece("TOP", { length: "knee" })], t).score).toBe(0.5);
    expect(lookProp([piece("TOP", { length: "cropped" }), piece("BOTTOM", { rise: "high" })], t).score).toBe(0);
  });

  it("COVERS arms: elbow sleeves or longer, and bare arms as the opposite", () => {
    const l = { cover: ["arms"] as const };
    expect(likeScore(piece("TOP", { sleeve: "elbow" }), { cover: ["arms"] })).toEqual({
      score: 0.5,
      reasons: [{ id: "COVERS", strength: 0.5, params: { zone: "arms", sleeve: "elbow" } }],
    });
    expect(likeScore(piece("KURTA", { sleeve: "three_quarter" }), l).score).toBe(0.5);
    expect(likeScore(piece("DRESS", { sleeve: "long" }), l).score).toBe(0.5);
    expect(likeScore(piece("TOP", { sleeve: "short" }), l).score).toBe(0);
    expect(likeScore(piece("TOP", { sleeve: "sleeveless" }), l)).toEqual({ score: -0.5, reasons: [] });
    expect(likeScore(piece("BLOUSE", { sleeve: "cap" }), l).score).toBe(-0.5);
    expect(likeScore(piece("DRESS", { sleeve: "strapless" }), l).score).toBe(-0.5);
  });

  it("COVERS midriff: covered, and bare as the opposite", () => {
    const l = { cover: ["midriff"] as const };
    expect(likeScore(piece("TOP", { coverage: { midriff: "covered" } }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "COVERS", strength: 0.5, params: { zone: "midriff" } }],
    });
    expect(likeScore(piece("BLOUSE", { coverage: { midriff: "bare" } }), l).score).toBe(-0.5);
    expect(likeScore(piece("TOP", { coverage: { midriff: "partly" } }), l).score).toBe(0);
  });

  it("COVERS legs: midi or longer, and above the knee as the opposite", () => {
    const l = { cover: ["legs"] as const };
    expect(likeScore(piece("BOTTOM", { coverage: { legs: "ankle" } }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "COVERS", strength: 0.5, params: { zone: "legs" } }],
    });
    for (const legs of ["midi", "floor", "trousers"] as const) {
      expect(likeScore(piece("DRESS", { coverage: { legs } }), l).score).toBe(0.5);
    }
    expect(likeScore(piece("DRESS", { coverage: { legs: "knee" } }), l).score).toBe(0);
    expect(likeScore(piece("BOTTOM", { coverage: { legs: "above_knee" } }), l).score).toBe(-0.5);
  });

  it("COVERS back: covered, and bare as the opposite", () => {
    const l = { cover: ["back"] as const };
    expect(likeScore(piece("BLOUSE", { coverage: { back: "covered" } }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "COVERS", strength: 0.5, params: { zone: "back" } }],
    });
    expect(likeScore(piece("DRESS", { coverage: { back: "bare" } }), l).score).toBe(-0.5);
  });

  it("COVERS for the look: a layer with sleeves covers the arms", () => {
    const l = likes({ cover: ["arms"] });
    const top = piece("TOP", { sleeve: "sleeveless" });
    const layer = piece("LAYER", { subtype: "cardigan", sleeve: "long" });
    expect(lookRuleTerms([top, layer], l, null).likes).toEqual({
      score: 0.5,
      reasons: [{ id: "COVERS", strength: 0.5, params: { zone: "arms", sleeve: "long" } }],
    });
    expect(lookRuleTerms([top], l, null).likes.score).toBe(0);
    expect(lookRuleTerms([top, piece("LAYER", { sleeve: "short" })], l, null).likes.score).toBe(0);
    expect(lookRuleTerms([top, layer], likes({ cover: ["back"] }), null).likes.score).toBe(0);
    // The bare top still scores down on its own, and the layer scores up on its own.
    expect(pieceRuleTerms(top, l, null).likes.score).toBe(-0.5);
    expect(pieceRuleTerms(layer, l, null).likes.score).toBe(0.5);
  });

  it("SHOWS_SHOULDERS from the like: an open neckline or volume at the shoulders", () => {
    const l = { define: ["shoulders"] as const };
    expect(likeScore(piece("TOP", { neckline: "off_shoulder" }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "SHOWS_SHOULDERS", strength: 0.5, params: { neckline: "off_shoulder" } }],
    });
    expect(likeScore(piece("DRESS", { neckline: "one_shoulder" }), l).reasons[0]?.params).toEqual({ neckline: "one_shoulder" });
    expect(likeScore(piece("TOP", { neckline: "crew", volumeAt: ["shoulders"] }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "SHOWS_SHOULDERS", strength: 0.5, params: {} }],
    });
    expect(likeScore(piece("TOP", { neckline: "crew" }), l).score).toBe(0);
    expect(likeScore(piece("TOP", { volumeAt: ["hem"] }), l).score).toBe(0);
  });

  it("SHOWS_LEGS from the like: a hem at or above the knee", () => {
    const l = { define: ["legs"] as const };
    expect(likeScore(piece("DRESS", { coverage: { legs: "knee" } }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "SHOWS_LEGS", strength: 0.5, params: { length: "knee" } }],
    });
    expect(likeScore(piece("BOTTOM", { coverage: { legs: "above_knee" } }), l).reasons[0]?.params).toEqual({ length: "above_knee" });
    expect(likeScore(piece("BOTTOM", { coverage: { legs: "ankle" } }), l).score).toBe(0);
  });

  it("EASY_FIT from the like: a loose shape in a fabric that doesn't cling, and bodycon as the opposite", () => {
    const l = { sit: "relaxed" as const };
    expect(likeScore(piece("TOP", { silhouette: "relaxed" }, { materials: ["cotton"] }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "EASY_FIT", strength: 0.5, params: { material: "cotton" } }],
    });
    expect(likeScore(piece("DRESS", { silhouette: "oversized" }, { materials: ["linen"] }), l).score).toBe(0.5);
    expect(likeScore(piece("DRESS", { silhouette: "flowy" }, { materials: ["chiffon"] }), l).score).toBe(0.5);
    expect(likeScore(piece("KURTA", { fit: { waist: "unstructured" } }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "EASY_FIT", strength: 0.5, params: {} }],
    });
    expect(likeScore(piece("BOTTOM", { fit: { hip: "relaxed" } }), l).score).toBe(0.5);
    // A loose shape in a fabric that clings is not easy.
    expect(likeScore(piece("TOP", { silhouette: "relaxed" }, { materials: ["jersey"] }), l).score).toBe(0);
    expect(likeScore(piece("TOP", { silhouette: "straight" }), l).score).toBe(0);
    expect(likeScore(piece("DRESS", { silhouette: "bodycon" }), l)).toEqual({ score: -0.5, reasons: [] });
    expect(likeScore(piece("DRESS", { fit: { waist: "bodycon" } }), l).score).toBe(-0.5);
  });

  it("CLEAN_LINE from the like: a close shape in a structured fabric, and oversized as the opposite", () => {
    const l = { sit: "fitted" as const };
    expect(likeScore(piece("DRESS", { silhouette: "fitted" }, { materials: ["denim"] }), l)).toEqual({
      score: 0.5,
      reasons: [{ id: "CLEAN_LINE", strength: 0.5, params: { material: "denim" } }],
    });
    expect(likeScore(piece("DRESS", { silhouette: "bodycon" }, { materials: ["brocade"] }), l).score).toBe(0.5);
    expect(likeScore(piece("TOP", { fit: { waist: "fitted" } }, { materials: ["linen"] }), l).score).toBe(0.5);
    // A fluid fabric, or a fabric we can't read, doesn't hold the line.
    expect(likeScore(piece("DRESS", { silhouette: "fitted" }, { materials: ["chiffon"] }), l).score).toBe(0);
    expect(likeScore(piece("DRESS", { silhouette: "fitted" }), l).score).toBe(0);
    expect(likeScore(piece("TOP", { silhouette: "oversized" }, { materials: ["denim"] }), l)).toEqual({ score: -0.5, reasons: [] });
  });
});

describe("combining rules", () => {
  it("rules ignore untrusted fields", () => {
    const at = (trust: number) =>
      piece("DRESS", { subtype: "midi dress", silhouette: "a_line", fit: { waist: "defined" }, coverage: { legs: "knee" } }, { trust });
    const l = likes({ define: ["waist", "legs"], sit: "relaxed" });
    const pr = props({ waist: bucket("defined") });
    const low = pieceRuleTerms(at(0.79), l, pr);
    expect(low.likes).toEqual({ score: 0, reasons: [] });
    expect(low.proportion).toEqual({ score: 0, reasons: [] });
    const ok = pieceRuleTerms(at(0.8), l, pr);
    expect(ok.likes.score).toBe(1);
    expect(ok.proportion.score).toBe(0.5);

    const look = (trust: number) => [
      piece("TOP", { length: "cropped" }, { trust }),
      piece("BOTTOM", { rise: "high" }, { trust }),
    ];
    expect(lookProp(look(0.79), { torso: bucket("longer_torso") }).score).toBe(0);
    expect(lookProp(look(0.8), { torso: bucket("longer_torso") }).score).toBe(0.5);
  });

  it("likes beat proportions", () => {
    const aLine = piece("DRESS", { subtype: "a-line dress", silhouette: "a_line" });
    const straight = props({ waist: bucket("straight") });
    const withLike = pieceRuleTerms(aLine, likes({ define: ["waist"] }), straight);
    expect(withLike.proportion).toEqual({ score: 0, reasons: [] });
    expect(withLike.likes.score).toBeGreaterThan(0);
    expect(ids(withLike.likes)).toEqual(["DEFINES_WAIST"]);
    expect(pieceRuleTerms(aLine, null, straight).proportion.score).toBe(0.5);

    const look = [piece("TOP", { neckline: "v" }), piece("BOTTOM", { silhouette: "a_line" })];
    const topWider = props({ balance: bucket("top_wider") });
    expect(lookRuleTerms(look, likes({ define: ["shoulders"] }), topWider).proportion).toEqual({ score: 0, reasons: [] });
    expect(lookRuleTerms(look, null, topWider).proportion.score).toBe(0.5);
    // A like on another axis leaves the rule alone.
    expect(lookRuleTerms(look, likes({ define: ["waist"], cover: ["arms"] }), topWider).proportion.score).toBe(0.5);

    // Cover legs pushes legs down, so HIGH_RISE (legs up) gives way; define legs does the same to LONG_TOP.
    const tucked = [piece("TOP", { length: "cropped" }), piece("BOTTOM", { rise: "high" })];
    expect(lookProp(tucked, { torso: bucket("longer_torso") }, likes({ cover: ["legs"] })).score).toBe(0);
    const long = [piece("KURTA", { length: "calf" })];
    expect(lookProp(long, { torso: bucket("longer_legs") }, likes({ define: ["legs"] })).score).toBe(0);
    // A zone in both define and cover is ignored, so neither like holds the rule back.
    expect(lookProp(long, { torso: bucket("longer_legs") }, likes({ define: ["legs"], cover: ["legs"] })).score).toBe(0.5);
  });

  it("ignores a zone listed in both define and cover", () => {
    const l = likes({ define: ["legs"], cover: ["legs"] });
    expect(pieceRuleTerms(piece("DRESS", { coverage: { legs: "knee" } }), l, null).likes.score).toBe(0);
    expect(pieceRuleTerms(piece("BOTTOM", { coverage: { legs: "ankle" } }), l, null).likes.score).toBe(0);
    expect(pieceRuleTerms(piece("BOTTOM", { coverage: { legs: "above_knee" } }), l, null).likes.score).toBe(0);
  });

  it("either sit fires neither", () => {
    const l = likes({ sit: "either" });
    for (const p of [
      piece("TOP", { silhouette: "relaxed" }, { materials: ["cotton"] }),
      piece("DRESS", { silhouette: "fitted" }, { materials: ["denim"] }),
      piece("DRESS", { silhouette: "bodycon" }),
      piece("TOP", { silhouette: "oversized" }),
    ]) {
      expect(pieceRuleTerms(p, l, null).likes).toEqual({ score: 0, reasons: [] });
    }
  });

  it("scores nothing without likes or proportions, or for slots outside the set", () => {
    const dress = piece("DRESS", { subtype: "wrap dress", silhouette: "a_line", sleeve: "long" });
    expect(pieceRuleTerms(dress, null, null)).toEqual({ likes: { score: 0, reasons: [] }, proportion: { score: 0, reasons: [] } });
    expect(lookRuleTerms([dress], null, null)).toEqual({ likes: { score: 0, reasons: [] }, proportion: { score: 0, reasons: [] } });
    const shoe = piece("FOOTWEAR", { subtype: "wrap sandal", silhouette: "fitted", sleeve: "long" });
    expect(pieceRuleTerms(shoe, likes({ define: ["waist"], cover: ["arms"] }), props({ waist: bucket("defined") }))).toEqual({
      likes: { score: 0, reasons: [] },
      proportion: { score: 0, reasons: [] },
    });
    const untagged: RulePiece = { ...dress, item: { ...dress.item, attributes: null } };
    expect(pieceRuleTerms(untagged, likes({ define: ["waist"] }), null).likes.score).toBe(0);
    expect(lookRuleTerms([untagged, shoe], likes({ cover: ["arms"] }), props({ balance: bucket("top_wider") }))).toEqual({
      likes: { score: 0, reasons: [] },
      proportion: { score: 0, reasons: [] },
    });
    // Rows called directly (as gaps may) return null for no piece or an untagged one.
    for (const r of WOMEN_RULES) {
      expect(r.match([])).toBeNull();
      expect(r.match([untagged])).toBeNull();
    }
  });

  it("falls back to the tagged slot when the item column has none", () => {
    const dress = piece("DRESS", { silhouette: "a_line" });
    const noColumn: RulePiece = { ...dress, item: { ...dress.item, slot: null } };
    expect(pieceRuleTerms(noColumn, likes({ define: ["waist"] }), null).likes.score).toBe(0.5);
  });

  it("terms clamp to [-1, 1]", () => {
    // Seven like rows match: 3.5 before the clamp.
    const all = piece(
      "DRESS",
      {
        subtype: "wrap dress",
        silhouette: "fitted",
        fit: { waist: "fitted" },
        sleeve: "long",
        neckline: "off_shoulder",
        coverage: { midriff: "covered", back: "covered", legs: "knee" },
      },
      { materials: ["denim"] },
    );
    const l = likes({ define: ["waist", "shoulders", "legs"], cover: ["arms", "midriff", "back"], sit: "fitted" });
    const up = pieceRuleTerms(all, l, props({ waist: bucket("defined") }));
    expect(up.likes.reasons).toHaveLength(7);
    expect(up.likes.score).toBe(1);
    expect(up.proportion.score).toBe(0.5);

    // Six opposites: −3 before the clamp.
    const none = piece("DRESS", {
      silhouette: "oversized",
      sleeve: "sleeveless",
      coverage: { midriff: "bare", back: "bare", legs: "above_knee" },
    });
    const down = pieceRuleTerms(none, likes({ define: ["waist"], cover: ["arms", "midriff", "back", "legs"], sit: "fitted" }), null);
    expect(down.likes.score).toBe(-1);

    // A look that matches every look rule for each bucket pair stays in range.
    const look = [
      piece("TOP", { neckline: "v", length: "cropped", volumeAt: ["sleeves"], pattern: "embroidered" }),
      piece("BOTTOM", { subtype: "wide-leg trousers", silhouette: "a_line", rise: "high", pattern: "solid" }),
      piece("LAYER", { sleeve: "long" }),
    ];
    for (const balance of ["top_wider", "bottom_wider"] as const) {
      const t = lookRuleTerms(look, likes({ cover: ["arms"] }), props({ balance: bucket(balance), torso: bucket("longer_torso") }));
      expect(t.proportion.score).toBe(1);
      expect(t.proportion.reasons).toHaveLength(2);
      expect(t.likes.score).toBe(0.5);
    }
  });

  it("keeps the rule numbers in one place", () => {
    expect(BODY_RULE_NUMBERS).toEqual({ like: 0.5, proportion: 0.5, darkerBy: 0.15, easyClingMax: 2, cleanDrapeMax: 2 });
  });
});

// ── Properties over random looks (seeded, so every run is the same) ─────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const maybe = <T>(rand: () => number, xs: readonly T[]): T | undefined => (rand() < 0.4 ? undefined : pick(rand, xs));

const SLOTS = ["TOP", "BOTTOM", "DRESS", "KURTA", "BLOUSE", "SAREE", "LAYER", "COORD_TOP", "COORD_BOTTOM", "FOOTWEAR"] as const;
const SUBTYPES = ["wrap dress", "tiered skirt", "anarkali kurta", "wide-leg trousers", "empire top", "boat neck top", "belted jacket", ""];
const MATERIAL_LISTS = [[], ["cotton"], ["jersey"], ["denim"], ["chiffon"], ["linen", "lycra"], ["unobtainium"]];

function randomPiece(rand: () => number): RulePiece {
  const volumeAt = maybe(rand, [["shoulders"], ["sleeves"], ["hem"], ["none"]] as const);
  return piece(
    pick(rand, SLOTS),
    {
      subtype: pick(rand, SUBTYPES),
      pattern: pick(rand, ["solid", "print", "embroidered", "floral"] as const),
      silhouette: maybe(rand, ["bodycon", "fitted", "a_line", "straight", "relaxed", "oversized", "flowy"] as const),
      fit: { waist: maybe(rand, ["bodycon", "fitted", "ruched", "defined", "relaxed", "unstructured"] as const) },
      sleeve: maybe(rand, ["strapless", "sleeveless", "cap", "short", "elbow", "three_quarter", "long"] as const),
      neckline: maybe(rand, ["off_shoulder", "one_shoulder", "scoop", "v", "crew", "collar", "other"] as const),
      coverage: {
        midriff: maybe(rand, ["covered", "partly", "bare"] as const),
        back: maybe(rand, ["covered", "partly", "bare"] as const),
        legs: maybe(rand, ["above_knee", "knee", "midi", "ankle", "floor", "trousers"] as const),
      },
      rise: maybe(rand, ["high", "mid", "low"] as const),
      length: maybe(rand, ["cropped", "waist", "hip", "thigh", "knee", "calf", "ankle", "floor"] as const),
      ...(volumeAt ? { volumeAt } : {}),
    },
    {
      materials: pick(rand, MATERIAL_LISTS),
      lightness: rand() < 0.2 ? null : rand(),
      ...(rand() < 0.5 ? { trust: rand() } : {}),
    },
  );
}

function randomLikes(rand: () => number): Likes | null {
  if (rand() < 0.2) return null;
  return {
    define: (["waist", "shoulders", "legs"] as const).filter(() => rand() < 0.4),
    cover: (["arms", "midriff", "legs", "back"] as const).filter(() => rand() < 0.3),
    sit: pick(rand, ["relaxed", "fitted", "either"] as const),
  };
}

function randomProportions(rand: () => number): Proportions | null {
  if (rand() < 0.2) return null;
  const conf = () => pick(rand, [1, 0.7, 0.35]);
  return {
    waist: rand() < 0.3 ? null : bucket(pick(rand, ["defined", "moderate", "straight"] as const), conf()),
    balance: rand() < 0.3 ? null : bucket(pick(rand, ["top_wider", "balanced", "bottom_wider"] as const), conf()),
    torso: rand() < 0.3 ? null : bucket(pick(rand, ["longer_torso", "balanced", "longer_legs"] as const), conf()),
  };
}

/** The axes the user's likes push, from the like rows that the likes trigger. */
function likedAxes(l: Likes | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!l) return out;
  const define = l.define.filter((z) => !(l.cover as readonly string[]).includes(z));
  const cover = l.cover.filter((z) => !(l.define as readonly string[]).includes(z));
  const active = new Set([...define.map((z) => `define:${z}`), ...cover.map((z) => `cover:${z}`), `sit:${l.sit}`]);
  for (const r of WOMEN_RULES) {
    if ("like" in r.trigger && active.has(r.trigger.like)) {
      for (const [axis, sign] of Object.entries(r.axes)) out.set(axis, sign);
    }
  }
  return out;
}

describe("properties", () => {
  it("terms stay in range, proportions never score down, and likes always beat proportions", () => {
    const rand = lcg(20261026);
    const rulesById = new Map<StyleReasonId, (typeof WOMEN_RULES)[number][]>();
    for (const r of WOMEN_RULES) rulesById.set(r.id, [...(rulesById.get(r.id) ?? []), r]);
    let fired = 0;
    let held = 0;
    for (let i = 0; i < 500; i++) {
      const look = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => randomPiece(rand));
      const l = randomLikes(rand);
      const pr = randomProportions(rand);
      const liked = likedAxes(l);
      const terms = [lookRuleTerms(look, l, pr), ...look.map((p) => pieceRuleTerms(p, l, pr))];
      for (const t of terms) {
        for (const term of [t.likes, t.proportion]) {
          expect(Number.isFinite(term.score)).toBe(true);
          expect(term.score).toBeGreaterThanOrEqual(-1);
          expect(term.score).toBeLessThanOrEqual(1);
          for (const r of term.reasons) expect(r.strength).toBeGreaterThan(0);
        }
        expect(t.proportion.score).toBeGreaterThanOrEqual(0);
        for (const r of t.proportion.reasons) {
          const rows = (rulesById.get(r.id) ?? []).filter((row) => "proportion" in row.trigger);
          for (const row of rows) {
            for (const [axis, sign] of Object.entries(row.axes)) {
              expect(liked.get(axis) === -sign).toBe(false);
            }
          }
        }
      }
      // Deterministic: the same input gives the same output.
      expect(lookRuleTerms(look, l, pr)).toEqual(terms[0]);
      // Likes only ever hold proportions back, never add to them.
      const withoutLikes = [lookRuleTerms(look, null, pr), ...look.map((p) => pieceRuleTerms(p, null, pr))];
      terms.forEach((t, k) => {
        const base = withoutLikes[k]!.proportion.score;
        expect(t.proportion.score).toBeLessThanOrEqual(base);
        if (t.proportion.reasons.length > 0) fired++;
        if (t.proportion.score < base) held++;
      });
    }
    // The run exercised both paths.
    expect(fired).toBeGreaterThan(20);
    expect(held).toBeGreaterThan(5);
  });
});
