import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notifications.js";
import { UserPrefsPatchSchema, UserPrefsSchema, splitUserPrefsPatch } from "./user-prefs.js";

const hold = {
  heldAt: "2026-10-26T08:00:00.000Z",
  releaseAt: "2026-10-27T08:00:00.000Z",
  category: "APPAREL",
  projectedMinor: 1250000,
  limitMinor: 1000000,
  cartFingerprint: "cart-1",
};

describe("UserPrefsSchema", () => {
  it("accepts today's consent_flags shapes for each key", () => {
    const prefs = {
      notifications: DEFAULT_NOTIFICATION_PREFERENCES,
      coolingOff: hold,
      capsuleItemIds: ["a", "b"],
      emailConnected: true,
      laundryRules: { dirtyAfterWears: 3, dirtyOnSweatTag: true },
      cpwThreshold: { maxCpwMinor: null },
      dismissedMissingLayerIds: ["layer-rain"],
    };
    expect(UserPrefsSchema.parse(prefs)).toEqual(prefs);
    expect(UserPrefsSchema.parse({})).toEqual({});
  });

  it("keeps unknown keys and rejects a wrong type", () => {
    expect(UserPrefsSchema.parse({ later: 1 })).toEqual({ later: 1 });
    expect(UserPrefsSchema.safeParse({ capsuleItemIds: "a" }).success).toBe(false);
    expect(UserPrefsSchema.safeParse({ capsuleItemIds: Array(51).fill("x") }).success).toBe(false);
    expect(UserPrefsSchema.safeParse({ coolingOff: { ...hold, limitMinor: "1" } }).success).toBe(false);
  });
});

describe("UserPrefsPatchSchema and splitUserPrefsPatch", () => {
  it("allows null to delete and rejects unknown keys", () => {
    expect(UserPrefsPatchSchema.parse({ coolingOff: null })).toEqual({ coolingOff: null });
    expect(UserPrefsPatchSchema.safeParse({ timeZone: "UTC" }).success).toBe(false);
  });

  it("splits sets from deletes and skips undefined", () => {
    expect(
      splitUserPrefsPatch({ capsuleItemIds: ["a"], coolingOff: null, emailConnected: undefined }),
    ).toEqual({ set: { capsuleItemIds: ["a"] }, deleteKeys: ["coolingOff"] });
    expect(splitUserPrefsPatch({})).toEqual({ set: {}, deleteKeys: [] });
  });
});
