import { z } from "zod";
import { NotificationPreferencesSchema } from "./notifications.js";

/**
 * `users.prefs`: per-user settings that are not consent. Each key keeps the shape it has under
 * `users.consent_flags` today, so a backfill copies it unchanged. Consent booleans stay in
 * `consent_flags`. Unknown keys pass through so an older reader never drops a newer key.
 */

/** Same shape as `CoolingOffHold` in apps/api/src/lib/cooling-off.ts. */
export const CoolingOffHoldSchema = z.object({
  heldAt: z.string(),
  releaseAt: z.string(),
  category: z.string(),
  projectedMinor: z.number(),
  limitMinor: z.number(),
  cartFingerprint: z.string(),
});

/** Same shape as `LaundryRulesPrefs` (laundry-rules.ts). */
export const LaundryRulesPrefsSchema = z.object({
  dirtyAfterWears: z.number().int().positive().nullable(),
  dirtyOnSweatTag: z.boolean(),
});

/** Same shape as `CpwThresholdPrefs` (cpw-threshold.ts). */
export const CpwThresholdPrefsSchema = z.object({
  maxCpwMinor: z.number().int().positive().nullable(),
});

const userPrefsShape = {
  /** Was `consent_flags.notifications` (NOTIFICATION_PREFS_FLAG_KEY). */
  notifications: NotificationPreferencesSchema,
  /** Was `consent_flags.coolingOff` (COOLING_OFF_FLAG_KEY): the active checkout hold. */
  coolingOff: CoolingOffHoldSchema,
  /** Was `consent_flags.capsuleItemIds` (CAPSULE_CONSENT_KEY): unique wardrobe item ids, at most 50. */
  capsuleItemIds: z.array(z.string().min(1)).max(50),
  /** Whether the user connected an inbox for receipt import. Not stored server-side before prefs. */
  emailConnected: z.boolean(),
  /** Closet ops (closet-ops-prefs.ts keeps these in process memory today). */
  laundryRules: LaundryRulesPrefsSchema,
  cpwThreshold: CpwThresholdPrefsSchema,
  /** Missing-layer gap ids the user dismissed (`dismissMissingLayer`; ids like "layer-rain"). */
  dismissedMissingLayerIds: z.array(z.string().min(1).max(64)).max(50),
};

export const UserPrefsSchema = z
  .object({
    notifications: userPrefsShape.notifications.optional(),
    coolingOff: userPrefsShape.coolingOff.optional(),
    capsuleItemIds: userPrefsShape.capsuleItemIds.optional(),
    emailConnected: userPrefsShape.emailConnected.optional(),
    laundryRules: userPrefsShape.laundryRules.optional(),
    cpwThreshold: userPrefsShape.cpwThreshold.optional(),
    dismissedMissingLayerIds: userPrefsShape.dismissedMissingLayerIds.optional(),
  })
  .passthrough();
export type UserPrefs = z.infer<typeof UserPrefsSchema>;

/**
 * A patch for `patchUserPrefs`: a key with a value replaces that key, a key set to `null` is
 * deleted, and a missing key is left alone. Values replace whole keys (no deep merge).
 */
export const UserPrefsPatchSchema = z
  .object({
    notifications: userPrefsShape.notifications.nullable().optional(),
    coolingOff: userPrefsShape.coolingOff.nullable().optional(),
    capsuleItemIds: userPrefsShape.capsuleItemIds.nullable().optional(),
    emailConnected: userPrefsShape.emailConnected.nullable().optional(),
    laundryRules: userPrefsShape.laundryRules.nullable().optional(),
    cpwThreshold: userPrefsShape.cpwThreshold.nullable().optional(),
    dismissedMissingLayerIds: userPrefsShape.dismissedMissingLayerIds.nullable().optional(),
  })
  .strict();
export type UserPrefsPatch = z.infer<typeof UserPrefsPatchSchema>;

/** Split a patch into the keys to set and the keys to delete; `undefined` values are skipped. */
export function splitUserPrefsPatch(patch: UserPrefsPatch): {
  set: Record<string, unknown>;
  deleteKeys: string[];
} {
  const set: Record<string, unknown> = {};
  const deleteKeys: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) deleteKeys.push(key);
    else set[key] = value;
  }
  return { set, deleteKeys };
}
