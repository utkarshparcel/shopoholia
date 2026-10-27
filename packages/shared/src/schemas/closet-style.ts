import { z } from "zod";
import { LEARN, prefKey } from "../closet-style/learn.js";
import type { PhotoMeasures } from "../closet-style/proportions.js";
import { MEASUREMENT_RANGES_CM } from "../closet-style/proportions.js";
import type {
  CoverLike,
  DayType,
  DefineLike,
  FeaturePref,
  FeatureValue,
  Likes,
  Proportions,
  ProportionSource,
  SitLike,
  StyleProfileInput,
} from "../closet-style/types.js";

/**
 * The style engine's wire shapes (style spec §3, §5.5, §9): the profile the composer receives,
 * and the bodies of the style routes. None of them carries a number in cm except the
 * measurements body, which only the route that saves them reads.
 */

export const DefineLikeSchema = z.enum(["waist", "shoulders", "legs"]) satisfies z.ZodType<DefineLike>;
export const CoverLikeSchema = z.enum(["arms", "midriff", "legs", "back"]) satisfies z.ZodType<CoverLike>;
export const SitLikeSchema = z.enum(["relaxed", "fitted", "either"]) satisfies z.ZodType<SitLike>;

/** Spec §3.1. Each zone at most once, and never in both `define` and `cover`. */
export const LikesSchema = z
  .object({
    define: z.array(DefineLikeSchema).max(3),
    cover: z.array(CoverLikeSchema).max(4),
    sit: SitLikeSchema,
  })
  .superRefine((likes, ctx) => {
    if (new Set(likes.define).size !== likes.define.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["define"], message: "Each zone at most once" });
    }
    if (new Set(likes.cover).size !== likes.cover.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cover"], message: "Each zone at most once" });
    }
    const define: readonly string[] = likes.define;
    if (likes.cover.some((zone) => define.includes(zone))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cover"], message: "A zone can't be in both define and cover" });
    }
  }) satisfies z.ZodType<Likes>;

export const ProportionSourceSchema = z.enum(["TAPE", "PHOTO"]) satisfies z.ZodType<ProportionSource>;

function bucket<U extends string, V extends [U, ...U[]]>(values: V) {
  return z.object({ value: z.enum(values), confidence: z.number().min(0).max(1), source: ProportionSourceSchema });
}

/** Spec §3.2: buckets only, never cm. A null bucket is unknown. */
export const ProportionsSchema = z.object({
  waist: bucket(["defined", "moderate", "straight"]).nullable(),
  balance: bucket(["top_wider", "balanced", "bottom_wider"]).nullable(),
  torso: bucket(["longer_torso", "balanced", "longer_legs"]).nullable(),
}) satisfies z.ZodType<Proportions>;

export const DayTypeSchema = z.enum(["work", "casual", "evening", "festive", "active"]) satisfies z.ZodType<DayType>;

/** The longest feature value accepted: a family, a colon and an enum value fit well inside it. */
export const FEATURE_VALUE_MAX = 64;
const FEATURE_VALUE = /^(colour|silhouette|sleeve|neckline|length|rise|pattern|fabric):[a-z0-9_]+$/;

/** `${family}:${value}`, as `featuresOf` writes it. */
export const FeatureValueSchema = z.custom<FeatureValue>(
  (v) => typeof v === "string" && v.length <= FEATURE_VALUE_MAX && FEATURE_VALUE.test(v),
  "Not a feature value",
);

/** One learned preference (spec §7). */
export const FeaturePrefSchema = z.object({
  dayType: DayTypeSchema,
  feature: FeatureValueSchema,
  value: z.number().min(-1).max(1),
  support: z.number().int().nonnegative(),
}) satisfies z.ZodType<FeaturePref>;

/** What the composer receives (spec §5.5): likes, buckets and learned preferences, never cm. One preference per key. */
export const StyleProfileInputSchema = z
  .object({
    version: z.number().int().nonnegative(),
    likes: LikesSchema.nullable(),
    proportions: ProportionsSchema.nullable(),
    learned: z.array(FeaturePrefSchema).max(LEARN.cap),
  })
  .superRefine((profile, ctx) => {
    const seen = new Set<string>();
    profile.learned.forEach((pref, i) => {
      const key = prefKey(pref);
      if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["learned", i], message: "Duplicate preference" });
      seen.add(key);
    });
  }) satisfies z.ZodType<StyleProfileInput>;

// ── Route bodies (plan Task B2) ──────────────────────────────────────────────

/** `PUT /closet/style/likes`. */
export const StyleLikesBodySchema = LikesSchema;

const positive = z.number().finite().positive();

/** What the phone measured from the photo: ratios only are read, so any one unit. */
export const PhotoMeasuresSchema = z.object({
  shoulderWidth: positive,
  waistWidth: positive,
  hipWidth: positive,
  torsoLength: positive,
  legLength: positive,
  quality: z.enum(["rough", "good"]),
}) satisfies z.ZodType<PhotoMeasures>;

export const MeasurementPointSchema = z.enum(["height", "bust", "waist", "hip", "shoulder"]);
export type MeasurementPoint = z.infer<typeof MeasurementPointSchema>;

/** Where each number came from (spec §3.2). */
export const MeasurementSourceSchema = z.enum(["TAPE", "PHOTO", "EDITED"]);
export type MeasurementSource = z.infer<typeof MeasurementSourceSchema>;

const cm = (point: MeasurementPoint) =>
  z.number().finite().min(MEASUREMENT_RANGES_CM[point][0]).max(MEASUREMENT_RANGES_CM[point][1]).optional();

const FIELD_OF: Readonly<Record<MeasurementPoint, "heightCm" | "bustCm" | "waistCm" | "hipCm" | "shoulderCm">> = {
  height: "heightCm",
  bust: "bustCm",
  waist: "waistCm",
  hip: "hipCm",
  shoulder: "shoulderCm",
};

/**
 * `PUT /closet/style/measurements`: tape numbers in cm inside `MEASUREMENT_RANGES_CM`, the photo's
 * ratios, and a source for every number sent, and only for those.
 */
export const StyleMeasurementsBodySchema = z
  .object({
    heightCm: cm("height"),
    bustCm: cm("bust"),
    waistCm: cm("waist"),
    hipCm: cm("hip"),
    shoulderCm: cm("shoulder"),
    photo: PhotoMeasuresSchema.optional(),
    sources: z.record(MeasurementPointSchema, MeasurementSourceSchema),
  })
  .superRefine((body, ctx) => {
    for (const point of MeasurementPointSchema.options) {
      const sent = body[FIELD_OF[point]] !== undefined;
      const sourced = body.sources[point] !== undefined;
      if (sent && !sourced) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sources", point], message: "Missing source" });
      if (!sent && sourced) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sources", point], message: "No such number" });
    }
  });
export type StyleMeasurementsBody = z.infer<typeof StyleMeasurementsBodySchema>;
