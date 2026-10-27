import { z } from "zod";

/** True for a date that exists: "2026-02-28" but not "2026-02-30", which `Date.parse` rolls over. */
function isCalendarDate(value: string): boolean {
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(value);
}

/** Local calendar date, e.g. "2026-11-09". The universe's date shape, plus a real-date check. */
export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, "Not a calendar date");
export type LocalDate = z.infer<typeof LocalDateSchema>;

/**
 * A UTC timestamp, checked as `z.string().datetime()` checks it, but with zod's regex built
 * once: `.datetime()` builds it again for every value, which a 1,000-item closet feels.
 */
export const TimestampSchema = z
  .string()
  .regex(z.datetimeRegex({ precision: null, offset: false, local: false }), "Invalid datetime");

export const ItemSlotSchema = z.enum([
  "TOP", "BOTTOM", "DRESS", "COORD_TOP", "COORD_BOTTOM", "JUMPSUIT",
  "SAREE", "BLOUSE", "KURTA", "DUPATTA", "LAYER", "ACTIVE_TOP", "ACTIVE_BOTTOM",
  "FOOTWEAR", "BAG", "EARRINGS", "NECKLACE", "BANGLES", "WATCH", "HAIR_ACCESSORY", "OTHER",
]);
export type ItemSlot = z.infer<typeof ItemSlotSchema>;

export const CoverageZoneSchema = z.enum(["covered", "partly", "bare"]);
export type CoverageZone = z.infer<typeof CoverageZoneSchema>;

export const LegCoverageSchema = z.enum(["above_knee", "knee", "midi", "ankle", "floor", "trousers"]);
export type LegCoverage = z.infer<typeof LegCoverageSchema>;

/** Where a bottom sits (style spec §4). */
export const RiseSchema = z.enum(["high", "mid", "low"]);
export type Rise = z.infer<typeof RiseSchema>;

/** Where the hem falls (style spec §4). */
export const LengthSchema = z.enum(["cropped", "waist", "hip", "thigh", "knee", "calf", "ankle", "floor"]);
export type Length = z.infer<typeof LengthSchema>;

/** Where the piece carries its volume (style spec §4). */
export const VolumeAtSchema = z.enum(["shoulders", "sleeves", "hem", "none"]);
export type VolumeAt = z.infer<typeof VolumeAtSchema>;

/** §3.3. The body fields (coverage, fit, hair) feed a backup check only when confirmed or confident. */
export const ItemAttributesSchema = z.object({
  v: z.literal(1),
  slot: ItemSlotSchema,
  subtype: z.string().max(40),
  colours: z.array(z.object({ name: z.string(), hex: z.string(), share: z.number() })).min(1).max(4),
  pattern: z.enum(["solid", "stripe", "check", "floral", "print", "embroidered", "other"]),
  materials: z.array(z.string()).max(3),
  warmth: z.object({ minC: z.number().int(), maxC: z.number().int() }),
  rainOk: z.boolean(),
  formality: z.number().int().min(1).max(5), // 1 lounge … 5 black tie / wedding
  occasions: z.array(z.string()).max(6),
  feel: z.array(z.enum(["relaxed", "polished", "playful", "minimal", "festive", "sporty"])).max(3),
  coverage: z
    .object({
      shoulders: CoverageZoneSchema,
      underarms: CoverageZoneSchema,
      midriff: CoverageZoneSchema,
      back: CoverageZoneSchema,
      legs: LegCoverageSchema,
    })
    .partial(),
  sleeve: z
    .enum(["strapless", "one_shoulder", "sleeveless", "cap", "short", "elbow", "three_quarter", "long"])
    .optional(),
  neckline: z
    .enum(["strapless", "off_shoulder", "one_shoulder", "halter", "scoop", "v", "crew", "collar", "high", "other"])
    .optional(),
  silhouette: z.enum(["bodycon", "fitted", "a_line", "straight", "relaxed", "oversized", "flowy"]).optional(),
  fit: z
    .object({
      waist: z.enum(["bodycon", "fitted", "ruched", "defined", "relaxed", "unstructured"]),
      hip: z.enum(["bodycon", "fitted", "relaxed", "unstructured"]),
    })
    .partial(),
  hair: z.object({ upFriendly: z.boolean(), styledDown: z.boolean() }).partial(),
  eveningOk: z.boolean(),
  footwear: z.object({ heelCm: z.number(), walkability: z.number().int().min(1).max(5) }).optional(),
  // Shape fields the style engine reads, behind the same gate as the body fields.
  rise: RiseSchema.optional(),
  length: LengthSchema.optional(),
  volumeAt: z.array(VolumeAtSchema).max(4).optional(),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
});
export type ItemAttributes = z.infer<typeof ItemAttributesSchema>;

/** A body field counts when confirmed by the user or inferred with at least this confidence. */
export const BODY_FIELD_MIN_CONFIDENCE = 0.8;

export const SizeSystemSchema = z.enum(["IN", "UK", "US", "EU", "ALPHA", "WAIST_IN", "FREE"]);
export type SizeSystem = z.infer<typeof SizeSystemSchema>;

export const AttributesSourceSchema = z.enum(["MODEL", "USER", "IMPORT"]);
export type AttributesSource = z.infer<typeof AttributesSourceSchema>;

export const PriceSourceSchema = z.enum(["USER", "IMPORT", "NONE"]);
export type PriceSource = z.infer<typeof PriceSourceSchema>;

export const CutoutStatusSchema = z.enum(["NONE", "PENDING", "READY", "FAILED"]);
export type CutoutStatus = z.infer<typeof CutoutStatusSchema>;

/**
 * The §3.1 columns Closet adds to `wardrobe_items`. The universe's `WardrobeItemSchema`
 * gains them with `.extend(ClosetItemFieldsSchema.shape)`; every field defaults, so rows
 * written before the migration still parse.
 */
export const ClosetItemFieldsSchema = z.object({
  /** A display name, "Sage ruched mini". */
  title: z.string().max(80).nullable().optional().default(null),
  slot: ItemSlotSchema.nullable().optional().default(null),
  /** Ties a co-ord set together, and a saree to its blouse. */
  setId: z.string().uuid().nullable().optional().default(null),
  sizeLabel: z.string().max(20).nullable().optional().default(null),
  sizeSystem: SizeSystemSchema.nullable().optional().default(null),
  materials: z.array(z.string()).max(3).optional().default([]),
  formality: z.number().int().min(1).max(5).nullable().optional().default(null),
  warmthMinC: z.number().int().nullable().optional().default(null),
  warmthMaxC: z.number().int().nullable().optional().default(null),
  /** Null until tagged. The column defaults to `{}`, which the API reads as null. */
  attributes: ItemAttributesSchema.nullable().optional().default(null),
  attributesVersion: z.number().int().nullable().optional().default(null),
  attributesSource: AttributesSourceSchema.nullable().optional().default(null),
  /** Attribute paths the user confirmed, e.g. `{ "coverage": true }` or `{ "fit.waist": true }`. */
  attributesConfirmed: z.record(z.string(), z.boolean()).optional().default({}),
  cutoutKey: z.string().nullable().optional().default(null),
  cutoutStatus: CutoutStatusSchema.optional().default("NONE"),
  /** The bigint column as a decimal string, so it survives JSON. */
  imagePhash: z.string().regex(/^-?\d{1,20}$/).nullable().optional().default(null),
  /** Cost per wear only counts real prices. */
  priceSource: PriceSourceSchema.optional().default("NONE"),
  purchasedOn: LocalDateSchema.nullable().optional().default(null),
  currency: z.string().length(3).optional().default("INR"),
  /** Soft delete: a 30-day restore window, then a purge. */
  deletedAt: TimestampSchema.nullable().optional().default(null),
});
export type ClosetItemFields = z.infer<typeof ClosetItemFieldsSchema>;
