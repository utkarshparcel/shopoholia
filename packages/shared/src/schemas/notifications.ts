import { z } from "zod";

const HhMm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

export const NotificationCategoriesSchema = z.object({
  returns: z.boolean(),
  warranty: z.boolean(),
  credits: z.boolean(),
  outfits: z.boolean(),
  /** Weekly closet digest + re-engagement (NOTIF-REENGAGE). */
  digest: z.boolean(),
});
export type NotificationCategories = z.infer<typeof NotificationCategoriesSchema>;

/** Max SENT/QUEUED pushes per category inside FREQUENCY_CAP_WINDOW_MS. */
export const FrequencyCapsSchema = z.object({
  returns: z.number().int().nonnegative(),
  warranty: z.number().int().nonnegative(),
  credits: z.number().int().nonnegative(),
  outfits: z.number().int().nonnegative(),
  digest: z.number().int().nonnegative(),
});
export type FrequencyCaps = z.infer<typeof FrequencyCapsSchema>;

export const NotificationPreferencesSchema = z.object({
  quietHoursStart: HhMm,
  quietHoursEnd: HhMm,
  categories: NotificationCategoriesSchema,
  frequencyCaps: FrequencyCapsSchema,
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const NotificationPreferencesResponseSchema = NotificationPreferencesSchema;
export type NotificationPreferencesResponse = NotificationPreferences;

export const UpdateNotificationPreferencesBodySchema = NotificationPreferencesSchema.partial().extend({
  categories: NotificationCategoriesSchema.partial().optional(),
  frequencyCaps: FrequencyCapsSchema.partial().optional(),
});
export type UpdateNotificationPreferencesBody = z.infer<
  typeof UpdateNotificationPreferencesBodySchema
>;

/** Rolling window for frequency caps (7 days). */
export const FREQUENCY_CAP_WINDOW_MS = 7 * 86_400_000;

export const DEFAULT_FREQUENCY_CAPS: FrequencyCaps = {
  returns: 14,
  warranty: 5,
  credits: 3,
  outfits: 10,
  digest: 1,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  categories: {
    returns: true,
    warranty: true,
    credits: true,
    outfits: true,
    digest: true,
  },
  frequencyCaps: { ...DEFAULT_FREQUENCY_CAPS },
};

/** Reserved key on users.consentFlags jsonb (no migration). */
export const NOTIFICATION_PREFS_FLAG_KEY = "notifications" as const;

function cloneDefaults(): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories },
    frequencyCaps: { ...DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps },
  };
}

/**
 * Parse prefs from consentFlags.notifications.
 * Backfills digest + frequencyCaps so older stored bags still gate correctly.
 */
export function parseNotificationPreferences(
  consentFlags: Record<string, unknown> | null | undefined,
): NotificationPreferences {
  const raw = consentFlags?.[NOTIFICATION_PREFS_FLAG_KEY];
  if (!raw || typeof raw !== "object") return cloneDefaults();

  const bag = raw as Record<string, unknown>;
  const cats =
    bag.categories && typeof bag.categories === "object"
      ? (bag.categories as Record<string, unknown>)
      : {};
  const caps =
    bag.frequencyCaps && typeof bag.frequencyCaps === "object"
      ? (bag.frequencyCaps as Record<string, unknown>)
      : {};

  const merged = {
    quietHoursStart: bag.quietHoursStart ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHoursStart,
    quietHoursEnd: bag.quietHoursEnd ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnd,
    categories: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
      ...cats,
    },
    frequencyCaps: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps,
      ...caps,
    },
  };

  const parsed = NotificationPreferencesSchema.safeParse(merged);
  if (!parsed.success) return cloneDefaults();
  return parsed.data;
}

export function mergeNotificationPreferences(
  current: NotificationPreferences,
  patch: UpdateNotificationPreferencesBody,
): NotificationPreferences {
  return {
    quietHoursStart: patch.quietHoursStart ?? current.quietHoursStart,
    quietHoursEnd: patch.quietHoursEnd ?? current.quietHoursEnd,
    categories: {
      returns: patch.categories?.returns ?? current.categories.returns,
      warranty: patch.categories?.warranty ?? current.categories.warranty,
      credits: patch.categories?.credits ?? current.categories.credits,
      outfits: patch.categories?.outfits ?? current.categories.outfits,
      digest: patch.categories?.digest ?? current.categories.digest,
    },
    frequencyCaps: {
      returns: patch.frequencyCaps?.returns ?? current.frequencyCaps.returns,
      warranty: patch.frequencyCaps?.warranty ?? current.frequencyCaps.warranty,
      credits: patch.frequencyCaps?.credits ?? current.frequencyCaps.credits,
      outfits: patch.frequencyCaps?.outfits ?? current.frequencyCaps.outfits,
      digest: patch.frequencyCaps?.digest ?? current.frequencyCaps.digest,
    },
  };
}
