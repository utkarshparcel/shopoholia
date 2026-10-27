import { z } from "zod";
import { CalendarTagSchema, WeatherDaySchema } from "./closet-context.js";
import { ItemSlotSchema, LocalDateSchema } from "./closet-item.js";

export const BackupCheckSchema = z.enum(["NOT_WAXED", "BLOATED", "BAD_HAIR", "PARTY_DATE"]);
export type BackupCheck = z.infer<typeof BackupCheckSchema>;

export const RestyleReasonSchema = z.enum([
  "BAD_HAIR", "BLOATED", "NOT_WAXED", "PARTY_DATE", "PLANS_CHANGED", "TOO_HOT", "TOO_COLD", "RAIN",
]);
export type RestyleReason = z.infer<typeof RestyleReasonSchema>;

export const WeekStatusSchema = z.enum([
  "SCHEDULED", "COMPOSING", "READY", "DELIVERED", "ACTIVE", "CLOSED", "SUPERSEDED", "FAILED",
]);
export type WeekStatus = z.infer<typeof WeekStatusSchema>;

export const OutfitKindSchema = z.enum(["DAY", "BACKUP", "RESTYLE", "MANUAL"]);
export type OutfitKind = z.infer<typeof OutfitKindSchema>;

export const OutfitStatusSchema = z.enum(["PROPOSED", "ACCEPTED", "WORN", "SKIPPED", "SUPERSEDED", "UNAVAILABLE"]);
export type OutfitStatus = z.infer<typeof OutfitStatusSchema>;

/** The universe's `OutfitOccasionSchema` plus FESTIVE (§3.1). */
export const ClosetOccasionSchema = z.enum(["CASUAL", "WORK", "FORMAL", "PARTY", "SPORT", "TRAVEL", "FESTIVE"]);
export type ClosetOccasion = z.infer<typeof ClosetOccasionSchema>;

/** A rule id plus its parameters; `closet-notes.ts` turns these into words. */
export const NoteReasonSchema = z.object({
  rule: z.string().min(1).max(40),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type NoteReason = z.infer<typeof NoteReasonSchema>;

/** Slot → wardrobe item id. `itemIds` is derived from it. */
export const OutfitSlotsSchema = z.record(ItemSlotSchema, z.string().uuid());
export type OutfitSlots = z.infer<typeof OutfitSlotsSchema>;

/** An `outfits` row with the §3.1 columns. Named apart from the universe's `OutfitSchema`. */
export const ClosetOutfitSchema = z.object({
  id: z.string().uuid(),
  kind: OutfitKindSchema,
  slots: OutfitSlotsSchema,
  itemIds: z.array(z.string().uuid()),
  occasion: ClosetOccasionSchema.nullable(),
  plannedFor: LocalDateSchema.nullable(),
  backupCheck: BackupCheckSchema.nullable(),
  restyleReason: RestyleReasonSchema.nullable(),
  forDay: LocalDateSchema.nullable(),
  fitsDays: z.array(LocalDateSchema),
  note: z.string(),
  noteReasons: z.array(NoteReasonSchema),
  status: OutfitStatusSchema,
  composerVersion: z.string(),
  score: z.number().nullable(),
  /** At most two style phrases under the note (style spec §8). Rows written before the style engine read as null. */
  styleWhy: z.string().nullable().optional().default(null),
});
export type ClosetOutfit = z.infer<typeof ClosetOutfitSchema>;

/** Preview render states. Named apart from the universe's try-on `RenderStatusSchema`. */
export const ClosetRenderStatusSchema = z.enum(["QUEUED", "LEASED", "DONE", "REJECTED_QC", "FAILED", "EXPIRED"]);
export type ClosetRenderStatus = z.infer<typeof ClosetRenderStatusSchema>;

export const RenderRefSchema = z.object({
  renderId: z.string().uuid(),
  status: ClosetRenderStatusSchema,
  url: z.string().url().nullable(),
  urlExpiresAt: z.string().datetime().nullable(),
  label: z.literal("Preview"),
});
export type RenderRef = z.infer<typeof RenderRefSchema>;

export const DayPlanSchema = z.object({
  date: LocalDateSchema, // "2026-11-09"
  context: z.object({
    label: z.string(), // "Lunch at 1 · 31°"
    tempMaxC: z.number().nullable(),
    events: z.array(CalendarTagSchema),
  }),
  outfit: ClosetOutfitSchema, // slots → items, note, noteReasons, status
  locked: z.boolean(),
});
export type DayPlan = z.infer<typeof DayPlanSchema>;

export const BackupStatusSchema = z.enum(["READY", "UNAVAILABLE"]);
export type BackupStatus = z.infer<typeof BackupStatusSchema>;

export const BackupSchema = z.object({
  check: BackupCheckSchema,
  status: BackupStatusSchema,
  forDay: LocalDateSchema.nullable(), // the day whose look triggered the check
  fitsDays: z.array(LocalDateSchema), // every day it can stand in for
  outfit: ClosetOutfitSchema.nullable(),
  why: z.string(), // "Monday’s strapless mini shows shoulders, underarms and legs."
  missing: z.string().nullable(), // when UNAVAILABLE: what the closet lacks
});
export type Backup = z.infer<typeof BackupSchema>;

export const WeekPlanSchema = z.object({
  plan: z.object({
    id: z.string().uuid(),
    isoWeek: z.string(),
    status: WeekStatusSchema,
    version: z.number().int(),
  }),
  days: z.array(DayPlanSchema).length(7),
  backups: z.array(BackupSchema).length(4),
  renders: z.record(z.string().uuid(), RenderRefSchema), // outfitId → preview status / URL
});
export type WeekPlan = z.infer<typeof WeekPlanSchema>;

export const WeekGenerateModeSchema = z.enum(["REGENERATE", "REST_OF_WEEK"]);
export type WeekGenerateMode = z.infer<typeof WeekGenerateModeSchema>;

/** `POST /outfits/week/generate`. */
export const WeekGenerateBodySchema = z.object({
  weekStart: LocalDateSchema,
  mode: WeekGenerateModeSchema,
  lockDays: z.array(LocalDateSchema).max(7).optional(),
});
export type WeekGenerateBody = z.infer<typeof WeekGenerateBodySchema>;

/** `PATCH /outfits/week/:date`. */
export const DayPatchSchema = z.union([
  z.object({ swap: z.object({ slot: ItemSlotSchema, itemId: z.string().uuid() }) }).strict(),
  z.object({ replaceWith: z.string().uuid() }).strict(),
  z.object({ lock: z.boolean() }).strict(),
]);
export type DayPatch = z.infer<typeof DayPatchSchema>;

/** `GET /outfits/today`. */
export const TodaySchema = z.object({
  date: LocalDateSchema,
  outfit: ClosetOutfitSchema.nullable(),
  note: z.string(),
  context: z.object({ weather: WeatherDaySchema.nullable(), events: z.array(CalendarTagSchema) }),
  backupsForToday: z.array(BackupSchema),
  render: RenderRefSchema.optional(),
});
export type Today = z.infer<typeof TodaySchema>;

/** `POST /outfits/today/restyle`. */
export const RestyleRequestSchema = z.object({
  reason: RestyleReasonSchema,
  occasion: ClosetOccasionSchema.optional(),
});
export type RestyleRequest = z.infer<typeof RestyleRequestSchema>;

export const RestyleSourceSchema = z.enum(["BACKUP", "COMPOSED", "NONE"]);
export type RestyleSource = z.infer<typeof RestyleSourceSchema>;

export const RestyleResultSchema = z.object({
  outfit: ClosetOutfitSchema.nullable(), // null when source is NONE
  source: RestyleSourceSchema,
  note: z.string(),
  why: z.string().optional(),
});
export type RestyleResult = z.infer<typeof RestyleResultSchema>;
