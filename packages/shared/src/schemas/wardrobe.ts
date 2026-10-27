import { z } from "zod";
import { DeclutterChallengeSchema, DeclutterShareCardSchema } from "./disposition.js";
import { DuplicateWarningSchema } from "./dup-rebuy.js";
import {
  CareRulesSchema,
  CareOcrBodySchema,
  CareOcrResponseSchema,
} from "../careLabel.js";

export { CareRulesSchema, CareOcrBodySchema, CareOcrResponseSchema };
export type { CareRules, CareOcrBody, CareOcrResponse } from "../careLabel.js";

export const WardrobeSourceSchema = z.enum(["MANUAL", "RECEIPT", "EMAIL", "SMS"]);
export type WardrobeSource = z.infer<typeof WardrobeSourceSchema>;

export const LaundryStatusSchema = z.enum(["CLEAN", "DIRTY", "IN_LAUNDRY"]);
export type LaundryStatus = z.infer<typeof LaundryStatusSchema>;

export const ClosetStatusSchema = z.enum(["ACTIVE", "STORED"]);
export type ClosetStatus = z.infer<typeof ClosetStatusSchema>;

export const SeasonSchema = z.enum(["summer", "winter", "monsoon"]);
export type Season = z.infer<typeof SeasonSchema>;

export const WardrobeItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  source: WardrobeSourceSchema,
  category: z.string().min(1),
  colors: z.array(z.string()),
  brand: z.string().nullable(),
  costMinor: z.number().int().nonnegative(),
  imageKeys: z.array(z.string()),
  garmentImageKey: z.string().nullable(),
  purchaseItemId: z.string().uuid().nullable(),
  laundryStatus: LaundryStatusSchema,
  closetStatus: ClosetStatusSchema.optional().default("ACTIVE"),
  tags: z.array(z.string()).optional().default([]),
  /** N20 — care / wash-label rules. */
  careRules: CareRulesSchema.nullable().optional().default(null),
  /** N22 — dry-cleaner ticket while out. */
  dryCleanTicket: z.string().nullable().optional().default(null),
  /** N22 — expected pickup day YYYY-MM-DD. */
  dryCleanPickupOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  /** N25 — who the item is lent to (null = not lent). */
  lentTo: z.string().nullable().optional().default(null),
  /** N25 — expected return day YYYY-MM-DD. */
  lentDueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  /** N27 — closet profile this item belongs to (null = default/unscoped). */
  profileId: z.string().uuid().nullable().optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  imageUrls: z.array(z.string()).optional(),
  garmentImageUrl: z.string().nullable().optional(),
});
export type WardrobeItem = z.infer<typeof WardrobeItemSchema>;

export const CreateWardrobeItemBodySchema = z.object({
  source: WardrobeSourceSchema.optional().default("MANUAL"),
  category: z.string().min(1),
  colors: z.array(z.string()).optional().default([]),
  brand: z.string().optional().nullable(),
  costMinor: z.number().int().nonnegative().optional().default(0),
  imageKeys: z.array(z.string()).optional().default([]),
  garmentImageKey: z.string().optional().nullable(),
  purchaseItemId: z.string().uuid().optional().nullable(),
  laundryStatus: LaundryStatusSchema.optional().default("CLEAN"),
  closetStatus: ClosetStatusSchema.optional().default("ACTIVE"),
  tags: z.array(z.string()).optional().default([]),
  careRules: CareRulesSchema.nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
});
export type CreateWardrobeItemBody = z.infer<typeof CreateWardrobeItemBodySchema>;

export const UpdateWardrobeItemBodySchema = z
  .object({
    category: z.string().min(1).optional(),
    colors: z.array(z.string()).optional(),
    brand: z.string().nullable().optional(),
    costMinor: z.number().int().nonnegative().optional(),
    imageKeys: z.array(z.string()).optional(),
    garmentImageKey: z.string().nullable().optional(),
    laundryStatus: LaundryStatusSchema.optional(),
    closetStatus: ClosetStatusSchema.optional(),
    tags: z.array(z.string()).optional(),
    careRules: CareRulesSchema.nullable().optional(),
    dryCleanTicket: z.string().nullable().optional(),
    dryCleanPickupOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    lentTo: z.string().nullable().optional(),
    lentDueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    profileId: z.string().uuid().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field required" });
export type UpdateWardrobeItemBody = z.infer<typeof UpdateWardrobeItemBodySchema>;

/** `PATCH /wardrobe/items`: one patch applied to up to 200 of the caller's items. */
export const BulkUpdateWardrobeItemsBodySchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, { message: "ids must be unique" }),
  patch: UpdateWardrobeItemBodySchema,
});
export type BulkUpdateWardrobeItemsBody = z.infer<typeof BulkUpdateWardrobeItemsBodySchema>;

export const BulkUpdateWardrobeItemsResponseSchema = z.object({
  items: z.array(WardrobeItemSchema),
});
export type BulkUpdateWardrobeItemsResponse = z.infer<typeof BulkUpdateWardrobeItemsResponseSchema>;

export const DryCleanDropOffBodySchema = z.object({
  ticket: z.string().min(1).max(64),
  pickupOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DryCleanDropOffBody = z.infer<typeof DryCleanDropOffBodySchema>;

export const DryCleanActionResponseSchema = z.object({
  item: WardrobeItemSchema,
  phase: z.enum(["IDLE", "AT_CLEANER", "RETURNED"]),
  pushScheduled: z.boolean().optional(),
});
export type DryCleanActionResponse = z.infer<typeof DryCleanActionResponseSchema>;

/** N21 — repair & alteration log. */
export const RepairKindSchema = z.enum(["REPAIR", "ALTERATION", "HEM", "ZIP", "OTHER"]);
export type RepairKind = z.infer<typeof RepairKindSchema>;

export const RepairLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  wardrobeItemId: z.string().uuid(),
  costMinor: z.number().int().nonnegative(),
  repairedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: RepairKindSchema,
  note: z.string().nullable(),
  tailorOrderId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RepairLog = z.infer<typeof RepairLogSchema>;

export const CreateRepairLogBodySchema = z.object({
  costMinor: z.number().int().nonnegative(),
  repairedOn: z.string().min(1),
  kind: RepairKindSchema.optional(),
  note: z.string().max(500).nullable().optional(),
  tailorOrderId: z.string().uuid().nullable().optional(),
});
export type CreateRepairLogBody = z.infer<typeof CreateRepairLogBodySchema>;

export const RepairLogsResponseSchema = z.object({
  repairs: z.array(RepairLogSchema),
});
export type RepairLogsResponse = z.infer<typeof RepairLogsResponseSchema>;

export const SeasonalSwapBodySchema = z.object({
  season: SeasonSchema,
  /** Optional: also stamp these item ids with season:* tag before swap. */
  tagItemIds: z.array(z.string().uuid()).max(200).optional(),
});
export type SeasonalSwapBody = z.infer<typeof SeasonalSwapBodySchema>;

export const SeasonalSwapResponseSchema = z.object({
  season: SeasonSchema,
  updated: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  stored: z.number().int().nonnegative(),
  items: z.array(WardrobeItemSchema),
});
export type SeasonalSwapResponse = z.infer<typeof SeasonalSwapResponseSchema>;

export const TravelPackBodySchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maxItems: z.number().int().min(1).max(40).optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
  })
  .refine((b) => b.endDate >= b.startDate, { message: "endDate must be on or after startDate" });
export type TravelPackBody = z.infer<typeof TravelPackBodySchema>;

export const TravelPackItemSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  brand: z.string().nullable(),
  slot: z.enum(["top", "bottom", "shoes", "outer", "dress", "accessory", "other"]),
  reason: z.string(),
  checked: z.boolean(),
});
export type TravelPackItem = z.infer<typeof TravelPackItemSchema>;

export const TravelPackResponseSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  nights: z.number().int().positive(),
  constraints: z.object({
    nights: z.number().int().positive(),
    maxItems: z.number().int().positive(),
    perSlot: z.record(z.number().int().nonnegative()),
  }),
  items: z.array(TravelPackItemSchema),
  checklist: z.string().min(1),
  weather: z
    .object({
      tempC: z.number(),
      condition: z.string(),
      source: z.enum(["api", "mock"]),
      fetchedAt: z.string(),
    })
    .nullable(),
});
export type TravelPackResponse = z.infer<typeof TravelPackResponseSchema>;

export const WorkwearRotationBodySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Persist planned outfits onto the week calendar. */
  commit: z.boolean().optional().default(true),
  /** W053 — prefer unique pieces across Mon–Fri (default true). */
  unique: z.boolean().optional().default(true),
});
export type WorkwearRotationBody = z.infer<typeof WorkwearRotationBodySchema>;

export const WardrobeListResponseSchema = z.object({
  items: z.array(WardrobeItemSchema),
  nextCursor: z.string().nullable().optional(),
});
export type WardrobeListResponse = z.infer<typeof WardrobeListResponseSchema>;

export const WardrobeTryonResponseSchema = z.object({
  /**
   * PROCESSING: a render is queued or running; ask again. FAILED: the last render failed; ask
   * again after `retryAfter`. NO_AVATAR: the user has no ready avatar photo yet.
   */
  status: z.enum(["READY", "PROCESSING", "FAILED", "NO_AVATAR"]),
  previewUrl: z.string().nullable(),
  imageKey: z.string().nullable().optional(),
  retryAfter: z.string().datetime().nullable().optional(),
});
export type WardrobeTryonResponse = z.infer<typeof WardrobeTryonResponseSchema>;

/** Queue `wardrobe-tryon`: render one wardrobe try-on (apps/api/src/jobs/wardrobe-tryon.ts). */
export const WardrobeTryonJobSchema = z.object({
  userId: z.string().uuid(),
  wardrobeItemId: z.string().uuid(),
});
export type WardrobeTryonJob = z.infer<typeof WardrobeTryonJobSchema>;

/** Queue `wardrobe-discard-purge`: delete a discarded item once its undo window has passed. */
export const WardrobeDiscardPurgeJobSchema = z.object({
  userId: z.string().uuid(),
  wardrobeItemId: z.string().uuid(),
});
export type WardrobeDiscardPurgeJob = z.infer<typeof WardrobeDiscardPurgeJobSchema>;

export const OutfitOccasionSchema = z.enum(["CASUAL", "WORK", "FORMAL", "PARTY", "SPORT", "TRAVEL"]);
export type OutfitOccasion = z.infer<typeof OutfitOccasionSchema>;

export const OutfitSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()),
  occasion: OutfitOccasionSchema.nullable(),
  weatherCtx: z.record(z.unknown()).nullable(),
  /** Explainability strings for why this outfit was chosen. */
  whyThis: z.array(z.string()).optional(),
  /** Calendar day YYYY-MM-DD when this is a week-plan outfit. */
  plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  generatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  items: z.array(WardrobeItemSchema).optional(),
});
export type Outfit = z.infer<typeof OutfitSchema>;

export const WorkwearRotationDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekday: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
  itemIds: z.array(z.string().uuid()),
  occasion: z.literal("WORK"),
  outfit: OutfitSchema.nullable().optional(),
});
export type WorkwearRotationDay = z.infer<typeof WorkwearRotationDaySchema>;

export const WorkwearRotationResponseSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unique: z.boolean(),
  days: z.array(WorkwearRotationDaySchema),
});
export type WorkwearRotationResponse = z.infer<typeof WorkwearRotationResponseSchema>;

export const TodayOutfitResponseSchema = z.object({
  outfit: OutfitSchema.nullable(),
  generated: z.boolean(),
  /** True when today's outfit was regenerated due to a weather shift before noon. */
  weatherRerolled: z.boolean().optional(),
  /** Ranked alternative index (0 = primary). */
  altIndex: z.number().int().nonnegative().optional(),
  /** True when another swipe alternative exists. */
  hasMore: z.boolean().optional(),
});
export type TodayOutfitResponse = z.infer<typeof TodayOutfitResponseSchema>;

export const SelectTodayOutfitBodySchema = z.object({
  outfitId: z.string().uuid().optional(),
  alt: z.number().int().min(0).max(20).optional(),
});
export type SelectTodayOutfitBody = z.infer<typeof SelectTodayOutfitBodySchema>;

export const BulkCreateWardrobeBodySchema = z.object({
  items: z.array(CreateWardrobeItemBodySchema).min(1).max(50),
  /** When true, fill missing/placeholder tags via vision/filename heuristics (WV04-AUTOTAG). */
  autoTag: z.boolean().optional().default(false),
});
export type BulkCreateWardrobeBody = z.infer<typeof BulkCreateWardrobeBodySchema>;

export const WardrobeAutoTagSuggestionSchema = z.object({
  imageKey: z.string().nullable(),
  category: z.string(),
  colors: z.array(z.string()),
  brand: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  sourceLabels: z.array(z.string()),
  duplicateWarnings: z.array(DuplicateWarningSchema).default([]),
});
export type WardrobeAutoTagSuggestion = z.infer<typeof WardrobeAutoTagSuggestionSchema>;

export const AutotagWardrobeBodySchema = z.object({
  images: z
    .array(
      z.object({
        imageKey: z.string().min(1),
        labels: z.array(z.string()).optional(),
        text: z.string().optional().nullable(),
        titleHint: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(50),
});
export type AutotagWardrobeBody = z.infer<typeof AutotagWardrobeBodySchema>;

export const AutotagWardrobeResponseSchema = z.object({
  suggestions: z.array(WardrobeAutoTagSuggestionSchema),
});
export type AutotagWardrobeResponse = z.infer<typeof AutotagWardrobeResponseSchema>;

export const BulkCreateWardrobeResponseSchema = z.object({
  items: z.array(WardrobeItemSchema),
  created: z.number().int().nonnegative(),
  /** Near-dup warnings when autoTag ran (WV04-AUTOTAG). */
  duplicateWarnings: z.array(DuplicateWarningSchema).optional().default([]),
});
export type BulkCreateWardrobeResponse = z.infer<typeof BulkCreateWardrobeResponseSchema>;

/** N55 — photo dump: image keys only; server auto-tags into wardrobe items. */
export const PhotoDumpPhotoSchema = z.object({
  imageKey: z.string().min(1),
  labels: z.array(z.string()).optional(),
  text: z.string().optional().nullable(),
  titleHint: z.string().optional().nullable(),
});
export type PhotoDumpPhoto = z.infer<typeof PhotoDumpPhotoSchema>;

export const PhotoDumpBodySchema = z.object({
  photos: z.array(PhotoDumpPhotoSchema).min(1).max(50),
  profileId: z.string().uuid().nullable().optional(),
});
export type PhotoDumpBody = z.infer<typeof PhotoDumpBodySchema>;

export const PhotoDumpResponseSchema = z.object({
  items: z.array(WardrobeItemSchema),
  created: z.number().int().nonnegative(),
  tagged: z.number().int().nonnegative(),
  duplicateWarnings: z.array(DuplicateWarningSchema).optional().default([]),
});
export type PhotoDumpResponse = z.infer<typeof PhotoDumpResponseSchema>;

export const FromPurchasesBodySchema = z.object({
  purchaseItemIds: z.array(z.string().uuid()).min(1).max(50),
});
export type FromPurchasesBody = z.infer<typeof FromPurchasesBodySchema>;

export const ImportablePurchaseItemSchema = z.object({
  purchaseItemId: z.string().uuid(),
  purchaseId: z.string().uuid(),
  merchant: z.string(),
  title: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  priceMinor: z.number().int(),
  imageKey: z.string().nullable(),
  imageUrl: z.string().nullable().optional(),
  alreadyInWardrobe: z.boolean(),
});
export type ImportablePurchaseItem = z.infer<typeof ImportablePurchaseItemSchema>;

export const ImportablePurchasesResponseSchema = z.object({
  items: z.array(ImportablePurchaseItemSchema),
});
export type ImportablePurchasesResponse = z.infer<typeof ImportablePurchasesResponseSchema>;

export const WeekOutfitDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekday: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
  isToday: z.boolean(),
  outfit: OutfitSchema.nullable(),
});
export type WeekOutfitDay = z.infer<typeof WeekOutfitDaySchema>;

export const WeekOutfitsResponseSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(WeekOutfitDaySchema).length(7),
});
export type WeekOutfitsResponse = z.infer<typeof WeekOutfitsResponseSchema>;

export const GenerateWeekDayBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** When true, fill every missing Mon–Sun day for the week. */
  fillWeek: z.boolean().optional().default(false),
  /** W052 — when true, constrain generator to capsule membership. */
  preferCapsule: z.boolean().optional(),
  /** U033 — overwrite pinned days when true. */
  replacePinned: z.boolean().optional().default(false),
});
export type GenerateWeekDayBody = z.infer<typeof GenerateWeekDayBodySchema>;

export const PatchWeekDayBodySchema = z
  .object({
    itemIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    occasion: OutfitOccasionSchema.nullable().optional(),
    /** U033 — pin/unpin outfit for this calendar day. */
    pinned: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.itemIds !== undefined || b.occasion !== undefined || b.pinned !== undefined,
    {
      message: "itemIds, occasion, or pinned required",
    },
  );
export type PatchWeekDayBody = z.infer<typeof PatchWeekDayBodySchema>;

/** Device calendar event → outfit (N03). */
export const CalendarEventInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().default(""),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional(),
});
export type CalendarEventInput = z.infer<typeof CalendarEventInputSchema>;

export const FromCalendarBodySchema = z.object({
  events: z.array(CalendarEventInputSchema).min(1).max(20),
  /** When true, schedule an optional night-before outfit reminder. */
  remindNightBefore: z.boolean().optional().default(false),
  /** Persist planned outfits onto the week calendar (default true). */
  commit: z.boolean().optional().default(true),
});
export type FromCalendarBody = z.infer<typeof FromCalendarBodySchema>;

export const FromCalendarEventResultSchema = z.object({
  eventId: z.string().nullable(),
  title: z.string(),
  startAt: z.string(),
  occasion: OutfitOccasionSchema,
  reason: z.string(),
  plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remindAt: z.string().datetime().nullable(),
  reminderScheduled: z.boolean(),
  outfit: OutfitSchema.nullable(),
});
export type FromCalendarEventResult = z.infer<typeof FromCalendarEventResultSchema>;

export const FromCalendarResponseSchema = z.object({
  events: z.array(FromCalendarEventResultSchema),
});
export type FromCalendarResponse = z.infer<typeof FromCalendarResponseSchema>;

/** N39 — wedding / festival multi-day planner. */
export const WeddingFestivalKindSchema = z.enum(["wedding", "festival"]);
export type WeddingFestivalKind = z.infer<typeof WeddingFestivalKindSchema>;

/** Longest wedding / festival plan, in days (inclusive). */
export const WEDDING_FESTIVAL_MAX_DAYS = 21;

export const WeddingFestivalBodySchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: WeddingFestivalKindSchema,
    label: z.string().max(120).optional(),
    /** Occasion spend envelope limit (minor units). */
    budgetLimitMinor: z.number().int().positive().optional(),
    /** Planned occasion spend against the envelope. */
    plannedSpendMinor: z.number().int().nonnegative().optional(),
    /** Persist day outfits onto the week calendar (default true). */
    commit: z.boolean().optional().default(true),
  })
  .refine((b) => b.endDate >= b.startDate, { message: "endDate must be on or after startDate" })
  .refine(
    (b) =>
      Date.parse(`${b.endDate}T00:00:00Z`) - Date.parse(`${b.startDate}T00:00:00Z`) <
      WEDDING_FESTIVAL_MAX_DAYS * 86_400_000,
    { message: `A wedding or festival plan covers at most ${WEDDING_FESTIVAL_MAX_DAYS} days` },
  );
export type WeddingFestivalBody = z.infer<typeof WeddingFestivalBodySchema>;

export const WeddingFestivalDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekday: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
  dayIndex: z.number().int().nonnegative(),
  dayLabel: z.string(),
  occasion: OutfitOccasionSchema,
  itemIds: z.array(z.string().uuid()),
  outfit: OutfitSchema.nullable().optional(),
});
export type WeddingFestivalDay = z.infer<typeof WeddingFestivalDaySchema>;

export const WeddingFestivalEnvelopeSchema = z.object({
  limitMinor: z.number().int().positive(),
  plannedSpendMinor: z.number().int().nonnegative(),
  ratio: z.number(),
  status: z.enum(["OK", "WARN", "EXCEEDED"]),
  alertThresholdHit: z.boolean(),
});
export type WeddingFestivalEnvelope = z.infer<typeof WeddingFestivalEnvelopeSchema>;

export const WeddingFestivalResponseSchema = z.object({
  kind: WeddingFestivalKindSchema,
  label: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayCount: z.number().int().positive(),
  days: z.array(WeddingFestivalDaySchema),
  envelope: WeddingFestivalEnvelopeSchema.nullable(),
});
export type WeddingFestivalResponse = z.infer<typeof WeddingFestivalResponseSchema>;

/** N40 — interview / ceremony saved kit. */
export const InterviewKitKindSchema = z.enum(["interview", "ceremony"]);
export type InterviewKitKind = z.infer<typeof InterviewKitKindSchema>;

export const InterviewKitBodySchema = z.object({
  name: z.string().min(1).max(120),
  kind: InterviewKitKindSchema.optional().default("interview"),
  itemIds: z.array(z.string().uuid()).min(1).max(20),
  eventAt: z.string().datetime(),
  occasion: OutfitOccasionSchema.optional(),
  /** Schedule night-before (−1d) reminder (default true). */
  remindNightBefore: z.boolean().optional().default(true),
  /** Upsert planned outfit for event day (default true). */
  commit: z.boolean().optional().default(true),
});
export type InterviewKitBody = z.infer<typeof InterviewKitBodySchema>;

export const InterviewKitSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  kind: InterviewKitKindSchema,
  itemIds: z.array(z.string().uuid()),
  eventAt: z.string().datetime(),
  occasion: OutfitOccasionSchema,
  remindAt: z.string().datetime().nullable(),
  reminderScheduled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  outfit: OutfitSchema.nullable().optional(),
});
export type InterviewKit = z.infer<typeof InterviewKitSchema>;

export const InterviewKitResponseSchema = z.object({
  kit: InterviewKitSchema,
});
export type InterviewKitResponse = z.infer<typeof InterviewKitResponseSchema>;

export const InterviewKitListResponseSchema = z.object({
  kits: z.array(InterviewKitSchema),
});
export type InterviewKitListResponse = z.infer<typeof InterviewKitListResponseSchema>;

/** W056 — edit event time or cancel night-before reminder. */
export const InterviewKitPatchBodySchema = z
  .object({
    eventAt: z.string().datetime().optional(),
    /** When true, clear remindAt / reminderScheduled. */
    cancelReminder: z.boolean().optional(),
    /** When true (and not canceling), (re)schedule night-before. */
    remindNightBefore: z.boolean().optional(),
  })
  .refine((b) => b.eventAt !== undefined || b.cancelReminder !== undefined || b.remindNightBefore !== undefined, {
    message: "eventAt, cancelReminder, or remindNightBefore required",
  });
export type InterviewKitPatchBody = z.infer<typeof InterviewKitPatchBodySchema>;

export const GoesWithMatchSchema = WardrobeItemSchema.extend({
  score: z.number(),
  slot: z.enum(["top", "bottom", "shoes", "outer", "dress", "accessory", "other"]),
  reasons: z.array(z.string()),
});
export type GoesWithMatch = z.infer<typeof GoesWithMatchSchema>;

export const GoesWithResponseSchema = z.object({
  anchorId: z.string().uuid(),
  matches: z.array(GoesWithMatchSchema),
});
export type GoesWithResponse = z.infer<typeof GoesWithResponseSchema>;

export const WearLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  wardrobeItemId: z.string().uuid().nullable(),
  outfitId: z.string().uuid().nullable(),
  wornOn: z.string().datetime(),
  imageKey: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  /** U031 — ISO timestamp when undo expires. */
  undoUntil: z.string().datetime().optional(),
});
export type WearLog = z.infer<typeof WearLogSchema>;

export const CreateWearBodySchema = z.object({
  wardrobeItemId: z.string().uuid().optional().nullable(),
  outfitId: z.string().uuid().optional().nullable(),
  wornOn: z.string().datetime().optional(),
  /** R2 object key from prior upload (e.g. wear/{userId}/{uuid}.jpg). */
  imageKey: z.string().min(1).optional().nullable(),
  /** A retried request with the same key returns the first wear log instead of logging again. */
  idempotencyKey: z.string().uuid().optional(),
});
export type CreateWearBody = z.infer<typeof CreateWearBodySchema>;

export const WearResponseSchema = WearLogSchema;
export type WearResponse = z.infer<typeof WearResponseSchema>;

export const WearPhotoUploadResponseSchema = z.object({
  imageKey: z.string().min(1),
  imageUrl: z.string(),
});
export type WearPhotoUploadResponse = z.infer<typeof WearPhotoUploadResponseSchema>;

export const ItemMetricStatusSchema = z.enum(["ACTIVE", "DORMANT", "DEAD"]);
export type ItemMetricStatus = z.infer<typeof ItemMetricStatusSchema>;

export const WearChallengeSchema = z.object({
  eligible: z.boolean(),
  progress: z.number().int().nonnegative(),
  target: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  completed: z.boolean(),
  label: z.string(),
});
export type WearChallenge = z.infer<typeof WearChallengeSchema>;

export const ItemMetricSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  wearCount: z.number().int().nonnegative(),
  lastWornAt: z.string().datetime().nullable(),
  costPerWearMinor: z.number().int().nullable(),
  status: ItemMetricStatusSchema,
  item: WardrobeItemSchema.optional(),
  /** Wear-it-3× challenge progress (WV05-WEAR3-CHALLENGE). */
  wearChallenge: WearChallengeSchema.optional(),
  /** Target cost-per-wear (minor units); null when unset (N41-CPW-GOALS). */
  targetCpwMinor: z.number().int().positive().nullable().optional(),
  /** Progress toward target CPW (N41-CPW-GOALS). */
  cpwGoal: z
    .object({
      active: z.boolean(),
      targetCpwMinor: z.number().int().positive().nullable(),
      currentCpwMinor: z.number().int().nonnegative().nullable(),
      costMinor: z.number().int().nonnegative(),
      wearCount: z.number().int().nonnegative(),
      wearsNeeded: z.number().int().nonnegative(),
      progress: z.number().int().nonnegative(),
      remaining: z.number().int().nonnegative(),
      completed: z.boolean(),
      label: z.string(),
    })
    .optional(),
});
export type ItemMetric = z.infer<typeof ItemMetricSchema>;

export const NeverWornShareCardSchema = z.object({
  neverWornCostMinor: z.number().int().nonnegative(),
  currency: z.string().min(1),
  itemCount: z.number().int().nonnegative(),
  amountLabel: z.string().min(1),
  blurredMerchants: z.array(z.string()),
  watermark: z.string().min(1),
  headline: z.string().min(1),
  shareText: z.string().min(1),
});
export type NeverWornShareCardResponse = z.infer<typeof NeverWornShareCardSchema>;

/** N53 rewear streak — consecutive wear_log days (optional purchase break). */
export const RewearStreakSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  todayLogged: z.boolean(),
  lastWearOn: z.string().nullable(),
  brokenByPurchase: z.boolean(),
  label: z.string(),
});
export type RewearStreakResponse = z.infer<typeof RewearStreakSchema>;

/** WV05-CO2 heuristic savings on the waste summary. */
export const Co2WaterSavingsSchema = z.object({
  rewearCount: z.number().int().nonnegative(),
  streakDays: z.number().int().nonnegative(),
  effectiveRewears: z.number().nonnegative(),
  kgCo2Saved: z.number().nonnegative(),
  litersWaterSaved: z.number().nonnegative(),
  label: z.string().min(1),
});
export type Co2WaterSavingsResponse = z.infer<typeof Co2WaterSavingsSchema>;

export const WasteSummaryResponseSchema = z.object({
  totalItems: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  dormant: z.number().int().nonnegative(),
  dead: z.number().int().nonnegative(),
  avgCostPerWearMinor: z.number().int().nullable(),
  /** Sum of costMinor for items with zero wears — the waste "aha". */
  neverWornCostMinor: z.number().int().nonnegative().optional().default(0),
  /** Shareable “₹/$X never worn” card payload (blurred merchants + watermark). */
  shareCard: NeverWornShareCardSchema.optional(),
  /** Consecutive days with a wear_log (habit before new buy). */
  rewearStreak: RewearStreakSchema.optional(),
  /** Heuristic CO₂ / water saved by re-wearing (WV05-CO2). */
  co2WaterSavings: Co2WaterSavingsSchema.optional(),
  /** Sell/donate N items challenge progress (N54). */
  declutterChallenge: DeclutterChallengeSchema.optional(),
  declutterShareCard: DeclutterShareCardSchema.optional(),
  metrics: z.array(ItemMetricSchema),
});
export type WasteSummaryResponse = z.infer<typeof WasteSummaryResponseSchema>;

export const WasteDeadResponseSchema = z.object({
  items: z.array(ItemMetricSchema),
});
export type WasteDeadResponse = z.infer<typeof WasteDeadResponseSchema>;

export const DisposeBodySchema = z.object({
  mode: z.enum(["SELL", "DONATE", "BARTER"]).default("SELL"),
  priceMinor: z.number().int().optional().nullable(),
  /** BARTER only: create an INDIVIDUAL seller and set disposition_listings.sellerId. */
  createSeller: z.boolean().optional(),
});
export type DisposeBody = z.infer<typeof DisposeBodySchema>;

export const DisposeResponseSchema = z.object({
  listingId: z.string().uuid(),
  wardrobeItemId: z.string().uuid(),
  mode: z.string(),
  status: z.string(),
});
export type DisposeResponse = z.infer<typeof DisposeResponseSchema>;

export const WearChallengeStartResponseSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  wearChallenge: WearChallengeSchema,
  pushQueued: z.boolean().optional().default(false),
});
export type WearChallengeStartResponse = z.infer<typeof WearChallengeStartResponseSchema>;

/** N32 — Capsule builder (N-item core set). */
export const CapsuleBodySchema = z.object({
  itemIds: z.array(z.string().uuid()).max(50),
  /** Soft cap; server clamps to 1–50 (default 12). */
  maxN: z.number().int().min(1).max(50).optional(),
});
export type CapsuleBody = z.infer<typeof CapsuleBodySchema>;

export const CapsuleResponseSchema = z.object({
  itemIds: z.array(z.string().uuid()),
  maxN: z.number().int().positive(),
  items: z.array(WardrobeItemSchema).optional(),
});
export type CapsuleResponse = z.infer<typeof CapsuleResponseSchema>;

/** N51 — Replace worn-out twin via affiliate. */
export const ReplaceTwinCandidateSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  score: z.number(),
  affiliateUrl: z.string().nullable(),
  platform: z.string(),
  reasons: z.array(z.string()),
  matchQuery: z.object({
    category: z.string(),
    colors: z.array(z.string()),
    brand: z.string().nullable(),
    tokens: z.array(z.string()),
  }),
});
export type ReplaceTwinCandidate = z.infer<typeof ReplaceTwinCandidateSchema>;

export const ReplaceTwinsResponseSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  candidates: z.array(ReplaceTwinCandidateSchema),
});
export type ReplaceTwinsResponse = z.infer<typeof ReplaceTwinsResponseSchema>;

export const ReplaceTwinClickBodySchema = z.object({
  listingId: z.string().uuid(),
  platform: z.string().min(1).optional(),
  clickId: z.string().min(1).optional(),
});
export type ReplaceTwinClickBody = z.infer<typeof ReplaceTwinClickBodySchema>;

export const ReplaceTwinClickResponseSchema = z.object({
  recorded: z.literal(true),
  clickId: z.string(),
  listingId: z.string().uuid(),
  wardrobeItemId: z.string().uuid(),
});
export type ReplaceTwinClickResponse = z.infer<typeof ReplaceTwinClickResponseSchema>;

/** N52 — Complete-the-look owned + missing affiliate slots. */
export const CompleteLookOwnedSlotSchema = z.object({
  slot: z.enum(["top", "bottom", "shoes", "outer", "dress", "accessory", "other"]),
  item: z.object({
    id: z.string().uuid(),
    category: z.string(),
    colors: z.array(z.string()).optional(),
    brand: z.string().nullable().optional(),
  }),
});

export const CompleteLookMissingSlotSchema = z.object({
  slot: z.enum(["top", "bottom", "shoes", "outer", "dress", "accessory", "other"]),
  listingId: z.string().uuid(),
  title: z.string(),
  affiliateUrl: z.string().nullable(),
  platform: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
});

export const CompleteLookResponseSchema = z.object({
  owned: z.array(CompleteLookOwnedSlotSchema),
  missing: z.array(CompleteLookMissingSlotSchema),
  gaps: z.array(
    z.object({
      slot: z.enum(["top", "bottom", "shoes", "outer", "dress", "accessory", "other"]),
      message: z.string(),
      ownedCompanions: z.number().int().nonnegative(),
    }),
  ),
  summary: z.string(),
});
export type CompleteLookResponse = z.infer<typeof CompleteLookResponseSchema>;

/** N29 — shoe & bag rotation suggestion. */
export const ShoeBagRotationKindSchema = z.enum(["shoes", "bag"]);
export type ShoeBagRotationKind = z.infer<typeof ShoeBagRotationKindSchema>;

export const ShoeBagRotationSuggestionSchema = WardrobeItemSchema.pick({
  id: true,
  category: true,
  brand: true,
  colors: true,
}).extend({
  kind: ShoeBagRotationKindSchema,
  wearCount: z.number().int().nonnegative(),
  lastWornAt: z.string().datetime().nullable(),
  score: z.number(),
  reason: z.string(),
});
export type ShoeBagRotationSuggestion = z.infer<typeof ShoeBagRotationSuggestionSchema>;

export const ShoeBagRotationResponseSchema = z.object({
  suggestions: z.array(ShoeBagRotationSuggestionSchema),
});
export type ShoeBagRotationResponse = z.infer<typeof ShoeBagRotationResponseSchema>;

/** N31 — missing-piece gap → shopping list. */
export const MissingPieceGapSchema = z.object({
  missingSlot: z.enum(["top", "bottom", "shoes", "outer", "dress", "accessory", "other"]),
  suggestion: z.string().min(1),
  unlockedByCount: z.number().int().nonnegative(),
  anchorSlot: z.enum(["top", "bottom", "shoes", "outer", "dress", "accessory", "other"]),
  colorHint: z.string().nullable(),
  message: z.string().min(1),
  affiliateUrl: z.string().url(),
  priority: z.number().int().min(0).max(100),
});
export type MissingPieceGap = z.infer<typeof MissingPieceGapSchema>;

export const MissingPieceReportSchema = z.object({
  gaps: z.array(MissingPieceGapSchema),
  summary: z.string(),
});
export type MissingPieceReport = z.infer<typeof MissingPieceReportSchema>;
