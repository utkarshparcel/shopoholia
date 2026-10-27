import type { BalanceBucket, Bucket, Proportions, ProportionSource, TorsoBucket, WaistBucket } from "./types.js";

/** Tape numbers outside these ranges (cm) count as missing: a typo, or inches typed as cm. */
export const MEASUREMENT_RANGES_CM = {
  height: [120, 220],
  bust: [60, 180],
  waist: [40, 170],
  hip: [60, 190],
  shoulder: [25, 60],
} as const;

/** What the phone measured from the photo, in any one unit (only ratios are read). */
export interface PhotoMeasures {
  shoulderWidth: number;
  waistWidth: number;
  hipWidth: number;
  torsoLength: number;
  legLength: number;
  quality: "rough" | "good";
}

/** The self profile's numbers. Never stored or sent past this module; only the buckets are. */
export interface Measurements {
  heightCm?: number | null;
  bustCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  shoulderCm?: number | null;
  photo?: PhotoMeasures | null;
}

/** Every bucket boundary and confidence (spec §5.2). Starting values for the stylist to review. */
export const PROPORTION_THRESHOLDS = {
  /** waist ÷ hip and waist ÷ bust (tape, the smaller), or waist width ÷ hip width (photo). */
  waist: {
    tape: { definedMax: 0.75, straightMin: 0.85 },
    photo: { definedMax: 0.8, straightMin: 0.9 },
  },
  /** bust ÷ hip (tape), or shoulder width ÷ hip width (photo). */
  balance: {
    tape: { topWiderMin: 1.05, bottomWiderMax: 0.95 },
    photo: { topWiderMin: 1.12, bottomWiderMax: 0.98 },
  },
  /** torso length ÷ leg length (photo only). */
  torso: {
    photo: { longerTorsoMin: 0.64, longerLegsMax: 0.54 },
  },
  confidence: { tape: 1, good: 0.7, rough: 0.35 },
} as const;

type PhotoFill = "waist" | "balance" | "torso";
const ALL_FILLS: readonly PhotoFill[] = ["waist", "balance", "torso"];

/** A tape number in cm, or null when it is missing, not finite, ≤ 0 or outside its range. */
function tapeCm(value: number | null | undefined, range: readonly [number, number]): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value >= range[0] && value <= range[1]
    ? value
    : null;
}

/** A photo ratio, or null when either side is missing, not finite or ≤ 0. */
function photoRatio(top: number, bottom: number): number | null {
  const ok = (x: number) => typeof x === "number" && Number.isFinite(x) && x > 0;
  return ok(top) && ok(bottom) ? top / bottom : null;
}

function waistOf(r: number, t: { definedMax: number; straightMin: number }): WaistBucket {
  return r <= t.definedMax ? "defined" : r >= t.straightMin ? "straight" : "moderate";
}

function balanceOf(r: number, t: { topWiderMin: number; bottomWiderMax: number }): BalanceBucket {
  return r >= t.topWiderMin ? "top_wider" : r <= t.bottomWiderMax ? "bottom_wider" : "balanced";
}

function torsoOf(r: number, t: { longerTorsoMin: number; longerLegsMax: number }): TorsoBucket {
  return r >= t.longerTorsoMin ? "longer_torso" : r <= t.longerLegsMax ? "longer_legs" : "balanced";
}

const make = <V extends string>(value: V, confidence: number, source: ProportionSource): Bucket<V> => ({ value, confidence, source });

/**
 * Turns the numbers into buckets with a confidence (spec §5.2). Tape wins wherever it can compute a bucket;
 * the photo fills only the buckets tape can't, and only those in `photoFills` (all three by default).
 */
export function proportionsOf(m: Measurements, opts?: { photoFills?: readonly ("waist" | "balance" | "torso")[] }): Proportions {
  const T = PROPORTION_THRESHOLDS;
  const R = MEASUREMENT_RANGES_CM;
  const fills = new Set(opts?.photoFills ?? ALL_FILLS);
  const bust = tapeCm(m.bustCm, R.bust);
  const waist = tapeCm(m.waistCm, R.waist);
  const hip = tapeCm(m.hipCm, R.hip);
  const photo = m.photo ?? null;
  const photoConfidence = photo?.quality === "good" ? T.confidence.good : T.confidence.rough;

  let waistBucket: Bucket<WaistBucket> | null = null;
  const waistRatios = waist === null ? [] : [hip, bust].filter((x): x is number => x !== null).map((x) => waist / x);
  if (waistRatios.length > 0) {
    waistBucket = make(waistOf(Math.min(...waistRatios), T.waist.tape), T.confidence.tape, "TAPE");
  } else if (photo && fills.has("waist")) {
    const r = photoRatio(photo.waistWidth, photo.hipWidth);
    if (r !== null) waistBucket = make(waistOf(r, T.waist.photo), photoConfidence, "PHOTO");
  }

  let balance: Bucket<BalanceBucket> | null = null;
  if (bust !== null && hip !== null) {
    balance = make(balanceOf(bust / hip, T.balance.tape), T.confidence.tape, "TAPE");
  } else if (photo && fills.has("balance")) {
    const r = photoRatio(photo.shoulderWidth, photo.hipWidth);
    if (r !== null) balance = make(balanceOf(r, T.balance.photo), photoConfidence, "PHOTO");
  }

  let torso: Bucket<TorsoBucket> | null = null;
  if (photo && fills.has("torso")) {
    const r = photoRatio(photo.torsoLength, photo.legLength);
    if (r !== null) torso = make(torsoOf(r, T.torso.photo), photoConfidence, "PHOTO");
  }

  return { waist: waistBucket, balance, torso };
}
