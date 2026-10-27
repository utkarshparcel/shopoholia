import { describe, expect, it } from "vitest";
import {
  DEFAULT_FREQUENCY_CAPS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  FREQUENCY_CAP_WINDOW_MS,
  FrequencyCapsSchema,
  NotificationCategoriesSchema,
  NotificationPreferencesSchema,
  UpdateNotificationPreferencesBodySchema,
  mergeNotificationPreferences,
  parseNotificationPreferences,
} from "./notifications.js";

describe("notification preferences helpers", () => {
  it("defaults when missing", () => {
    expect(parseNotificationPreferences({})).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("parses stored consentFlags.notifications", () => {
    const prefs = parseNotificationPreferences({
      EMAIL: true,
      notifications: {
        quietHoursStart: "23:00",
        quietHoursEnd: "06:00",
        categories: {
          returns: false,
          warranty: true,
          credits: true,
          outfits: false,
          digest: false,
        },
        frequencyCaps: { returns: 2, digest: 0 },
      },
    });
    expect(prefs.quietHoursStart).toBe("23:00");
    expect(prefs.categories.returns).toBe(false);
    expect(prefs.categories.outfits).toBe(false);
    expect(prefs.categories.digest).toBe(false);
    expect(prefs.frequencyCaps.returns).toBe(2);
    expect(prefs.frequencyCaps.digest).toBe(0);
    // Backfill missing caps from defaults
    expect(prefs.frequencyCaps.warranty).toBe(DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps.warranty);
  });

  it("backfills digest category for legacy stored bags without digest", () => {
    const prefs = parseNotificationPreferences({
      notifications: {
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        categories: { returns: true, warranty: true, credits: true, outfits: true },
      },
    });
    expect(prefs.categories.digest).toBe(true);
    expect(prefs.frequencyCaps.digest).toBe(1);
  });

  it("treats non-object categories/frequencyCaps as empty bags and backfills", () => {
    const prefs = parseNotificationPreferences({
      notifications: {
        quietHoursStart: "21:00",
        quietHoursEnd: "06:30",
        categories: "all",
        frequencyCaps: 3,
      },
    });
    expect(prefs.quietHoursStart).toBe("21:00");
    expect(prefs.categories).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.categories);
    expect(prefs.frequencyCaps).toEqual(DEFAULT_FREQUENCY_CAPS);
  });

  it("falls back to defaults when quiet hours are invalid", () => {
    const prefs = parseNotificationPreferences({
      notifications: {
        quietHoursStart: "not-a-time",
        quietHoursEnd: "07:00",
        categories: DEFAULT_NOTIFICATION_PREFERENCES.categories,
        frequencyCaps: DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps,
      },
    });
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("merges partial patches including digest + caps", () => {
    const next = mergeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
      quietHoursStart: "21:30",
      categories: { returns: false, digest: false },
      frequencyCaps: { outfits: 1 },
    });
    expect(next.quietHoursStart).toBe("21:30");
    expect(next.quietHoursEnd).toBe("07:00");
    expect(next.categories.returns).toBe(false);
    expect(next.categories.warranty).toBe(true);
    expect(next.categories.digest).toBe(false);
    expect(next.frequencyCaps.outfits).toBe(1);
    expect(next.frequencyCaps.returns).toBe(DEFAULT_NOTIFICATION_PREFERENCES.frequencyCaps.returns);
  });

  it("merge keeps current when patch omits categories and caps", () => {
    const next = mergeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
      quietHoursEnd: "08:00",
    });
    expect(next.quietHoursEnd).toBe("08:00");
    expect(next.quietHoursStart).toBe(DEFAULT_NOTIFICATION_PREFERENCES.quietHoursStart);
    expect(next.categories).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.categories);
    expect(next.frequencyCaps).toEqual(DEFAULT_FREQUENCY_CAPS);
  });

  it("merge applies every frequencyCap + category key when patched", () => {
    const next = mergeNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
      categories: {
        returns: false,
        warranty: false,
        credits: false,
        outfits: false,
        digest: false,
      },
      frequencyCaps: {
        returns: 1,
        warranty: 2,
        credits: 0,
        outfits: 4,
        digest: 0,
      },
    });
    expect(next.categories).toEqual({
      returns: false,
      warranty: false,
      credits: false,
      outfits: false,
      digest: false,
    });
    expect(next.frequencyCaps).toEqual({
      returns: 1,
      warranty: 2,
      credits: 0,
      outfits: 4,
      digest: 0,
    });
  });
});

describe("notification preference schemas", () => {
  it("accepts defaults and rejects bad HH:mm / negative caps", () => {
    expect(NotificationPreferencesSchema.parse(DEFAULT_NOTIFICATION_PREFERENCES)).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    expect(FREQUENCY_CAP_WINDOW_MS).toBe(7 * 86_400_000);
    expect(FrequencyCapsSchema.safeParse({ ...DEFAULT_FREQUENCY_CAPS, digest: -1 }).success).toBe(
      false,
    );
    expect(NotificationCategoriesSchema.safeParse({ ...DEFAULT_NOTIFICATION_PREFERENCES.categories, digest: "yes" }).success).toBe(
      false,
    );
    expect(
      UpdateNotificationPreferencesBodySchema.parse({
        frequencyCaps: { digest: 2 },
        categories: { digest: false },
      }),
    ).toEqual({
      frequencyCaps: { digest: 2 },
      categories: { digest: false },
    });
  });
});
