import { z } from "zod";
import { sortEvents } from "../closet-notes.js";
import type { ClosetDayContext } from "../schemas/closet-context.js";
import { ClosetDayContextSchema } from "../schemas/closet-context.js";
import type { ItemAttributes } from "../schemas/closet-item.js";
import {
  ClosetItemFieldsSchema,
  ItemAttributesSchema,
  ItemSlotSchema,
  LocalDateSchema,
  TimestampSchema,
} from "../schemas/closet-item.js";
import { StyleProfileInputSchema } from "../schemas/closet-style.js";
import {
  BackupCheckSchema,
  BackupSchema,
  ClosetOutfitSchema,
  RestyleRequestSchema,
  WeekGenerateModeSchema,
} from "../schemas/closet-week.js";
import { addDays, weekday } from "./dates.js";
import { canonicalJson, sha256Hex } from "./hash.js";

/** The composer's inputs. Every entry point parses with these first and never throws on bad input. */

export const MAX_CLOSET_ITEMS = 5000;

/** The universe's laundry and closet states (`LaundryStatusSchema`, `ClosetStatusSchema` in `wardrobe.ts`). */
const LaundryStateSchema = z.enum(["CLEAN", "DIRTY", "IN_LAUNDRY"]);
const ClosetStateSchema = z.enum(["ACTIVE", "STORED"]);

/**
 * The item fields the composer reads. A universe `WardrobeItem` extended with
 * `ClosetItemFieldsSchema` parses as one; unknown keys are stripped.
 */
export const ComposerItemSchema = ClosetItemFieldsSchema.pick({
  slot: true,
  setId: true,
  materials: true,
  formality: true,
  warmthMinC: true,
  warmthMaxC: true,
  attributes: true,
  attributesSource: true,
  attributesConfirmed: true,
  priceSource: true,
  deletedAt: true,
}).extend({
  id: z.string().uuid(),
  category: z.string().min(1),
  colors: z.array(z.string()),
  costMinor: z.number().int().nonnegative(),
  laundryStatus: LaundryStateSchema,
  closetStatus: ClosetStateSchema.optional().default("ACTIVE"),
  dryCleanTicket: z.string().nullable().optional().default(null),
  dryCleanPickupOn: LocalDateSchema.nullable().optional().default(null),
  lentTo: z.string().nullable().optional().default(null),
  lentDueOn: LocalDateSchema.nullable().optional().default(null),
  /** An open alteration order (`tailoring_orders`), and the day it is due back. */
  tailorOrderId: z.string().uuid().nullable().optional().default(null),
  tailorPickupOn: LocalDateSchema.nullable().optional().default(null),
});
export type ComposerItem = z.infer<typeof ComposerItemSchema>;
export type ComposerItemInput = z.input<typeof ComposerItemSchema>;

/** The part of the universe's `ItemMetricSchema` the composer reads. */
export const ComposerMetricSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  wearCount: z.number().int().nonnegative(),
  lastWornAt: TimestampSchema.nullable(),
  /** Wears in the 180 days before the week, for the palette (style spec §6). Missing counts as none. */
  wears180: z.number().int().nonnegative().optional(),
});
export type ComposerMetric = z.infer<typeof ComposerMetricSchema>;

const Multiplier = z.number().min(0.5).max(2);

/** `closet_settings` as the composer sees it. Missing fields fall back to the defaults. */
export const ComposerSettingsSchema = z
  .object({
    /** The universe's `LaundryRulesPrefs`, partial; `normalizeLaundryRules` semantics. */
    laundryRules: z
      .object({ dirtyAfterWears: z.number().nullable().optional(), dirtyOnSweatTag: z.boolean().optional() })
      .nullable()
      .optional()
      .default(null),
    /** `checks_enabled`: a check that is missing is on. */
    checksEnabled: z.record(BackupCheckSchema, z.boolean()).optional().default({}),
    /** The user's learned soft-score multipliers (§8.8), bounded so one odd week can't swing the plan. */
    weights: z
      .object({
        harmony: Multiplier,
        forgotten: Multiplier,
        costPerWear: Multiplier,
        variety: Multiplier,
        occasion: Multiplier,
        comfort: Multiplier,
        // The style engine's terms (style spec §5.1).
        likes: Multiplier,
        proportion: Multiplier,
        palette: Multiplier,
        fabric: Multiplier,
      })
      .partial()
      .optional()
      .default({}),
  })
  .optional()
  .default({});
export type ComposerSettings = z.infer<typeof ComposerSettingsSchema>;

/** `week_plans.seed`: a bigint column, so a safe integer, a digit string or a bigint. */
export const ComposerSeedSchema = z
  .union([z.number().int().safe(), z.string().regex(/^-?\d{1,20}$/), z.bigint()])
  .transform((seed) => String(seed));

const closetFields = {
  items: z.array(ComposerItemSchema).max(MAX_CLOSET_ITEMS),
  metrics: z.array(ComposerMetricSchema).max(MAX_CLOSET_ITEMS).optional().default([]),
  settings: ComposerSettingsSchema,
  seed: ComposerSeedSchema,
};

/** A day already in the plan: kept when locked, or when it is before today in REST_OF_WEEK. */
export const CurrentDaySchema = z.object({
  date: LocalDateSchema,
  outfit: ClosetOutfitSchema,
  locked: z.boolean(),
});
export type CurrentDay = z.infer<typeof CurrentDaySchema>;

export const ComposeWeekInputSchema = z.object({
  weekStart: LocalDateSchema,
  mode: WeekGenerateModeSchema.optional().default("REGENERATE"),
  /** Required for REST_OF_WEEK: days before it are kept as planned. */
  today: LocalDateSchema.nullable().optional().default(null),
  days: z.array(ClosetDayContextSchema).length(7),
  current: z.array(CurrentDaySchema).max(7).optional().default([]),
  /** Likes, proportion buckets and learned preferences; null composes without them. Never cm. */
  styleProfile: StyleProfileInputSchema.nullable().optional().default(null),
  ...closetFields,
});
export type ComposeWeekInput = z.input<typeof ComposeWeekInputSchema>;
export type ComposeWeekArgs = z.output<typeof ComposeWeekInputSchema>;

export const ComposeBackupsInputSchema = z.object({
  weekStart: LocalDateSchema,
  /** Laundry returns and recency are judged from here; the week's Monday when null. */
  today: LocalDateSchema.nullable().optional().default(null),
  days: z.array(ClosetDayContextSchema).length(7),
  /** The week's seven looks, Monday first, as planned or swapped. */
  plan: z.array(ClosetOutfitSchema).length(7),
  ...closetFields,
});
export type ComposeBackupsInput = z.input<typeof ComposeBackupsInputSchema>;

export const RestyleInputSchema = z.object({
  request: RestyleRequestSchema,
  /** Today, with today's forecast and tags. */
  context: ClosetDayContextSchema,
  /** Today's look, or null when the day had none. */
  current: ClosetOutfitSchema.nullable(),
  /** This week's backups. */
  backups: z.array(BackupSchema).max(4).optional().default([]),
  ...closetFields,
});
export type RestyleInput = z.input<typeof RestyleInputSchema>;

export const SwapInputSchema = z.object({
  context: ClosetDayContextSchema,
  outfit: ClosetOutfitSchema,
  swap: z.object({ slot: ItemSlotSchema, itemId: z.string().uuid() }),
  ...closetFields,
});
export type SwapInput = z.input<typeof SwapInputSchema>;

export type ComposerErrorCode = "INVALID_INPUT" | "NOT_A_MONDAY" | "WRONG_DAYS" | "WRONG_DATE" | "MISSING_PREVIOUS";

export interface ComposerIssue {
  path: string;
  message: string;
}

export interface ComposerError {
  code: ComposerErrorCode;
  message: string;
  issues: ComposerIssue[];
}

export type ComposerResult<T> = { ok: true; value: T } | { ok: false; error: ComposerError };

const MAX_ISSUES = 20;

export function failure(code: ComposerErrorCode, path: string, message: string): { ok: false; error: ComposerError } {
  return { ok: false, error: { code, message, issues: [{ path, message }] } };
}

export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): ComposerResult<z.output<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return { ok: false, error: { code: "INVALID_INPUT", message: "The input does not match the schema.", issues } };
}

function duplicate(values: readonly string[]): number {
  const seen = new Set<string>();
  for (let i = 0; i < values.length; i++) {
    if (seen.has(values[i])) return i;
    seen.add(values[i]);
  }
  return -1;
}

const ITEM_KEYS = Object.keys(ComposerItemSchema.shape) as (keyof ComposerItem)[];
const ATTRIBUTE_KEYS = Object.keys(ItemAttributesSchema.shape) as (keyof ItemAttributes)[];
const METRIC_KEYS = Object.keys(ComposerMetricSchema.shape) as (keyof ComposerMetric)[];

/** A record as its entries, keys sorted: `[key, value, key, value, …]`. */
function entries(record: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  for (const key of Object.keys(record).sort()) out.push(key, record[key]);
  return out;
}

/** An item as its values in `ITEM_KEYS` order, its attributes in `ATTRIBUTE_KEYS` order. */
function itemRow(item: ComposerItem): unknown[] {
  const row: unknown[] = [];
  for (const key of ITEM_KEYS) {
    if (key === "attributesConfirmed") {
      row.push(entries(item.attributesConfirmed));
    } else if (key === "attributes" && item.attributes !== null) {
      const attributes = item.attributes;
      // An absent optional attribute becomes null, which the schema never allows it to be.
      row.push(ATTRIBUTE_KEYS.map((k) => (k === "confidence" ? entries(attributes.confidence) : attributes[k])));
    } else {
      row.push(item[key]);
    }
  }
  return row;
}

/**
 * The closet inputs as canonical JSON text: items by id, metrics by item, each as a row of
 * values under one list of keys. Parsed objects keep their keys in schema order and records
 * are sorted, so equal inputs give equal text whatever order they arrive in; rows halve the
 * text a 1,000-item closet hashes.
 */
export function closetKey(a: {
  items: readonly ComposerItem[];
  metrics: readonly ComposerMetric[];
  settings: ComposerSettings;
  seed: string;
}): string {
  const items = [...a.items].sort((x, y) => (x.id < y.id ? -1 : 1)).map(itemRow);
  const metrics = [...a.metrics]
    .sort((x, y) => (x.wardrobeItemId < y.wardrobeItemId ? -1 : 1))
    .map((m) => METRIC_KEYS.map((k) => m[k]));
  const keys = { attributes: ATTRIBUTE_KEYS, item: ITEM_KEYS, metric: METRIC_KEYS };
  return `{"items":${JSON.stringify(items)},"keys":${JSON.stringify(keys)},"metrics":${JSON.stringify(metrics)},"seed":${JSON.stringify(a.seed)},"settings":${canonicalJson(a.settings)}}`;
}

/** `inputsHash`: sha256 over the inputs as canonical JSON, the call's own fields first, then the closet. */
export function inputsHashOf(fields: Record<string, unknown>, closet: Parameters<typeof closetKey>[0]): string {
  return sha256Hex(`[${canonicalJson(fields)},${closetKey(closet)}]`);
}

export function dayKey(day: ClosetDayContext): ClosetDayContext {
  return { ...day, events: sortEvents(day.events) };
}

/** Checks a parsed closet: item and metric ids are unique. */
export function checkCloset(items: readonly ComposerItem[], metrics: readonly ComposerMetric[]): ComposerError | null {
  const item = duplicate(items.map((i) => i.id));
  if (item >= 0) return failure("INVALID_INPUT", `items.${item}.id`, "Duplicate item id").error;
  const metric = duplicate(metrics.map((m) => m.wardrobeItemId));
  if (metric >= 0) return failure("INVALID_INPUT", `metrics.${metric}.wardrobeItemId`, "Duplicate metric").error;
  return null;
}

/** Checks one day's context and the outfit planned for it: the forecast and the outfit are for that day. */
export function checkDay(
  context: { date: string; weather: { date: string } | null },
  plannedFor: string | null,
  path: string,
): ComposerError | null {
  if (context.weather !== null && context.weather.date !== context.date) {
    return failure("WRONG_DAYS", "context.weather.date", `Expected ${context.date}`).error;
  }
  if (plannedFor !== null && plannedFor !== context.date) {
    return failure("WRONG_DATE", path, `Expected ${context.date}`).error;
  }
  return null;
}

/** Checks that `weekStart` is a Monday and the contexts are its seven days, in order. */
export function checkWeek(
  weekStart: string,
  days: readonly { date: string; weather: { date: string } | null }[],
): ComposerError | null {
  if (weekday(weekStart) !== 0) return failure("NOT_A_MONDAY", "weekStart", "weekStart must be a Monday").error;
  for (let i = 0; i < days.length; i++) {
    if (days[i].date !== addDays(weekStart, i)) {
      return failure("WRONG_DAYS", `days.${i}.date`, `Expected ${addDays(weekStart, i)}`).error;
    }
    const weather = days[i].weather;
    if (weather !== null && weather.date !== days[i].date) {
      return failure("WRONG_DAYS", `days.${i}.weather.date`, `Expected ${days[i].date}`).error;
    }
  }
  return null;
}
