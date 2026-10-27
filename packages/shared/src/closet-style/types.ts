/**
 * The style engine's shared types (spec docs/superpowers/specs/2026-10-26-closet-style-engine-design.md §9.3).
 * Every closet-style module is pure: no I/O, no clock, no randomness.
 *
 * The item unions come from the composer's `schemas/closet-item.ts`, so the two can't drift apart.
 */

import type { ComposerItem } from "../closet-composer/input.js";
import type {
  AttributesSource,
  CoverageZone,
  ItemAttributes,
  ItemSlot,
  LegCoverage,
  Length,
  Rise,
  VolumeAt,
} from "../schemas/closet-item.js";

export type { CoverageZone, ItemSlot, LegCoverage, Length, Rise, VolumeAt };
export type Pattern = ItemAttributes["pattern"];
export type Feel = ItemAttributes["feel"][number];
export type Sleeve = NonNullable<ItemAttributes["sleeve"]>;
export type Neckline = NonNullable<ItemAttributes["neckline"]>;
export type Silhouette = NonNullable<ItemAttributes["silhouette"]>;
export type WaistFit = NonNullable<ItemAttributes["fit"]["waist"]>;
export type HipFit = NonNullable<ItemAttributes["fit"]["hip"]>;

export interface StyleColour {
  name: string;
  hex: string;
  share: number;
}

/** The part of `ItemAttributes` the style engine reads, plus the spec §4 fields. */
export interface StyleAttributes {
  slot: ItemSlot;
  subtype: string;
  colours: readonly StyleColour[];
  pattern: Pattern;
  materials: readonly string[];
  warmth: { minC: number; maxC: number };
  rainOk: boolean;
  /** 1 lounge … 5 black tie / wedding. */
  formality: number;
  occasions: readonly string[];
  feel: readonly Feel[];
  coverage: {
    shoulders?: CoverageZone;
    underarms?: CoverageZone;
    midriff?: CoverageZone;
    back?: CoverageZone;
    legs?: LegCoverage;
  };
  sleeve?: Sleeve;
  neckline?: Neckline;
  silhouette?: Silhouette;
  fit: { waist?: WaistFit; hip?: HipFit };
  eveningOk: boolean;
  rise?: Rise;
  length?: Length;
  volumeAt?: readonly VolumeAt[];
  /** Keyed by field path ("fit.waist") or group ("fit"). */
  confidence: Readonly<Record<string, number>>;
}

/** Structurally a subset of the composer's `ComposerItem`, so one can be passed as the other. */
export interface StyleItem {
  id: string;
  slot: ItemSlot | null;
  /** The item column; `attributes.materials` is used when this is empty. */
  materials: readonly string[];
  attributes: StyleAttributes | null;
  attributesSource: AttributesSource | null;
  /** Paths the user confirmed: `{ "fit.waist": true }` or `{ "fit": true }`. */
  attributesConfirmed: Readonly<Record<string, boolean>>;
}

type Assert<T extends true> = T;
/** A type test: the composer's item passes as a `StyleItem` as it is. It fails to compile if they drift. */
export type ComposerItemIsStyleItem = Assert<ComposerItem extends StyleItem ? true : false>;

export interface StyleMetric {
  itemId: string;
  /** Wears in the 180 days before the week being planned. */
  wears180: number;
}

// ── The person ────────────────────────────────────────────────────────────────

/** Spec §3.1 likes. An empty list is "none". A zone is never in both `define` and `cover`. */
export type DefineLike = "waist" | "shoulders" | "legs";
export type CoverLike = "arms" | "midriff" | "legs" | "back";
export type SitLike = "relaxed" | "fitted" | "either";
export interface Likes {
  define: readonly DefineLike[];
  cover: readonly CoverLike[];
  sit: SitLike;
}

export type ProportionSource = "TAPE" | "PHOTO";
export interface Bucket<V extends string> {
  value: V;
  /** 0–1: tape 1, photo "good" 0.7, photo "rough" 0.35. */
  confidence: number;
  source: ProportionSource;
}
export type WaistBucket = "defined" | "moderate" | "straight";
export type BalanceBucket = "top_wider" | "balanced" | "bottom_wider";
export type TorsoBucket = "longer_torso" | "balanced" | "longer_legs";
/** Never raw cm (spec §3.2). A null bucket is unknown, and its rules don't fire. */
export interface Proportions {
  waist: Bucket<WaistBucket> | null;
  balance: Bucket<BalanceBucket> | null;
  torso: Bucket<TorsoBucket> | null;
}

export type DayType = "work" | "casual" | "evening" | "festive" | "active";
export type FeatureFamily = "colour" | "silhouette" | "sleeve" | "neckline" | "length" | "rise" | "pattern" | "fabric";
/** `${family}:${value}`: "sleeve:sleeveless", "colour:pink", "fabric:linen". */
export type FeatureValue = `${FeatureFamily}:${string}`;

/** One learned preference (spec §7). Its key is `${dayType}|${feature}`. */
export interface FeaturePref {
  dayType: DayType;
  feature: FeatureValue;
  /** −1 … 1. */
  value: number;
  /** Signals that agree with the sign of `value`. The preference counts once this is 3 or more. */
  support: number;
}

/** What the composer receives (spec §5.5). */
export interface StyleProfileInput {
  version: number;
  likes: Likes | null;
  proportions: Proportions | null;
  learned: readonly FeaturePref[];
}

// ── The day ───────────────────────────────────────────────────────────────────

/** The part of the composer's `Day` the style terms read. Task B1 builds it from `Day`. */
export interface StyleDay {
  date: string;
  dayType: DayType;
  highC: number | null;
  rainChance: number | null;
  /** 0–1 when the forecast provider gives it. */
  humidity: number | null;
  /** A work event of eight hours or more. */
  longDay: boolean;
  /** Hours the longest event runs, for the long-day reason. Null when unknown. */
  hours: number | null;
  /** The formality footwear and accessories aim for, 1–5. */
  formality: number;
  /** A festive occasion (wedding, sangeet, puja, festival). */
  festive: boolean;
}

// ── Scores and reasons ───────────────────────────────────────────────────────

export type StyleReasonId =
  | "DEFINES_WAIST"
  | "SKIMS_WAIST"
  | "VOLUME_BELOW"
  | "INTEREST_ABOVE"
  | "HIGH_RISE"
  | "LONG_TOP"
  | "COVERS"
  | "EASY_FIT"
  | "CLEAN_LINE"
  | "SHOWS_SHOULDERS"
  | "SHOWS_LEGS"
  | "BREATHABLE_HEAT"
  | "LOW_CREASE_LONG_DAY"
  | "DRIES_FAST";

export type ReasonParams = Readonly<Record<string, string | number>>;

export interface StyleReason {
  id: StyleReasonId;
  /** How much this reason moved the score, so the strongest are shown first. */
  strength: number;
  params: ReasonParams;
}

/** One style term (spec §5.1): a score from −1 to 1 and the reasons behind it. */
export interface Term {
  score: number;
  reasons: readonly StyleReason[];
}

export const ZERO_TERM: Term = { score: 0, reasons: [] };

// ── Colour and palette ───────────────────────────────────────────────────────

export interface Oklch {
  /** 0–1. */
  l: number;
  c: number;
  /** Degrees, 0 ≤ h < 360. 0 when the colour has no chroma. */
  h: number;
}

export type HueFamily = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "brown" | "neutral";
export type LightBand = "light" | "mid" | "deep";

export interface Swatch {
  /** `${family}-${band}`. */
  key: string;
  family: HueFamily;
  band: LightBand;
  /** The heaviest colour in the bin. */
  hex: string;
  /** Share of the closet's total colour weight, 0–1. */
  weight: number;
}

export type PaletteConfidence = "low" | "medium" | "high";

export interface PaletteLean {
  temperature: "warm" | "cool" | "mixed";
  chroma: "soft" | "mid" | "bright";
  depth: "light" | "mid" | "deep";
}

export interface Palette {
  /** At most 8, heaviest first. */
  swatches: readonly Swatch[];
  /** Null when there are no colours with chroma to lean on. */
  lean: PaletteLean | null;
  /** The neutral names they rely on, heaviest first: "black", "white", "grey", "cream", "denim", "tan", "camel", "olive". */
  neutrals: readonly string[];
  confidence: PaletteConfidence;
  /** "owned" until there are wears in the window. */
  basis: "owned" | "worn";
  /** Items that contributed a colour. */
  pieceCount: number;
}

// ── Gaps ──────────────────────────────────────────────────────────────────────

export type GapKind = "occasion" | "piece" | "colour" | "like";
export type GapFeature =
  | "defines_waist"
  | "rain_ok"
  | "evening"
  | "festive"
  | "layer_warm"
  | "covers_arms"
  | "covers_legs"
  | "covers_midriff"
  | "covers_back"
  | "relaxed"
  | "fitted";

/** A piece that doesn't exist, described by attributes only. */
export interface GapCandidate {
  slot: ItemSlot;
  family: HueFamily;
  band: LightBand | null;
  /** For neutrals: "black", "cream", "denim"…; null otherwise. */
  neutral: string | null;
  feature: GapFeature | null;
}

export type GapWhyId =
  | "OCCASION_NO_LOOK"
  | "SLOT_MISSING"
  | "RAIN_FOOTWEAR"
  | "LAYER_COOL_MORNINGS"
  | "BLOUSE_FOR_SAREES"
  | "EVENING_IN_COLOURS"
  | "NEUTRAL_BOTTOM_FOR_PRINTS"
  | "LIKE_UNMET";

export interface Gap {
  /** Stable across runs: `${kind}:${slot}:${family}-${band ?? "any"}:${neutral ?? "-"}:${feature ?? "-"}`, plus `:${forDate}` for occasion gaps. */
  key: string;
  kind: GapKind;
  what: GapCandidate;
  /** New passing looks across the next four weeks of day types. */
  unlocks: number;
  why: { id: GapWhyId; params: ReasonParams };
  forDate: string | null;
}

/** The composer's look builder, injected (Task B1): new passing looks that include the candidate. */
export type LookCounter = (candidate: GapCandidate) => number;
