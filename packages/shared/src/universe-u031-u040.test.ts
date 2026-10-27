import { describe, expect, it } from "vitest";
import {
  WEAR_LOG_UNDO_WINDOW_MS,
  canUndoWearLog,
  wearBatchConfirmCopy,
  wearBatchConfirmPieces,
} from "./wear-log-batch.js";
import {
  applyLaundryRuleAfterWear,
  laundryBasketItemIds,
  normalizeLaundryRules,
} from "./laundry-rules.js";
import {
  isOutfitPinned,
  pinConflictWarn,
  shouldSkipPinnedOnReroll,
  withOutfitPinned,
} from "./outfit-pin.js";
import { detectMissingLayers } from "./missing-layer.js";
import {
  KEEP_SNOOZE_DAYS,
  keepSnoozeUntil,
  resolveDisposeTree,
} from "./dispose-tree.js";
import {
  collectCpwThresholdAlerts,
  cpwAboveThresholdAlert,
} from "./cpw-threshold.js";
import {
  diffMeasurePoints,
  latestMeasurement,
  whatChangedNote,
} from "./fit-measure-history.js";
import {
  canMarkTailorReceived,
  shouldSendTailorPickupNudge,
  tailorPickupNudgeDate,
  tailorStatusTimeline,
} from "./tailor-chase.js";
import { applyLentOverdueAction, lentOverdueActionLabels } from "./lent-overdue-actions.js";
import {
  applyPhotoDumpTriageTags,
  isPhotoDumpTriagePending,
  photoDumpTriageProgress,
  undoPhotoDumpTriageTags,
} from "./photo-dump-triage.js";

describe("U031 wear-log batch", () => {
  it("lists pieces and allows undo inside 10m", () => {
    const pieces = wearBatchConfirmPieces([
      { id: "1", category: "shirt", brand: "COS" },
      { id: "2", category: "belt" },
    ]);
    expect(pieces).toHaveLength(2);
    expect(pieces[1]!.kind).toBe("accessory");
    expect(wearBatchConfirmCopy(pieces).pieceCount).toBe(2);
    const created = new Date(Date.now() - 60_000);
    expect(canUndoWearLog(created)).toBe(true);
    expect(canUndoWearLog(new Date(Date.now() - WEAR_LOG_UNDO_WINDOW_MS - 1))).toBe(false);
  });
});

describe("U032 laundry rules", () => {
  it("auto-dirties on N wears and sweat tag; batch ids", () => {
    expect(
      applyLaundryRuleAfterWear({
        current: "CLEAN",
        wearCountAfter: 3,
        rules: { dirtyAfterWears: 3 },
      }),
    ).toBe("DIRTY");
    expect(
      applyLaundryRuleAfterWear({
        current: "CLEAN",
        wearCountAfter: 1,
        tags: ["sweat"],
        rules: { dirtyOnSweatTag: true },
      }),
    ).toBe("DIRTY");
    expect(
      applyLaundryRuleAfterWear({
        current: "IN_LAUNDRY",
        wearCountAfter: 9,
        tags: ["sweat"],
      }),
    ).toBe("IN_LAUNDRY");
    expect(normalizeLaundryRules({ dirtyAfterWears: null }).dirtyAfterWears).toBeNull();
    expect(
      laundryBasketItemIds([
        { id: "a", laundryStatus: "DIRTY" },
        { id: "b", laundryStatus: "CLEAN" },
        { id: "c", laundryStatus: "IN_LAUNDRY" },
      ]),
    ).toEqual(["a", "c"]);
  });
});

describe("U033 outfit pin", () => {
  it("pins, skips reroll, warns conflict", () => {
    const ctx = withOutfitPinned({ tempC: 22 }, true);
    expect(isOutfitPinned(ctx)).toBe(true);
    expect(shouldSkipPinnedOnReroll(ctx)).toBe(true);
    expect(shouldSkipPinnedOnReroll(ctx, { force: true })).toBe(false);
    expect(pinConflictWarn("2026-08-27", ctx)?.warn).toBe(true);
    expect(pinConflictWarn("2026-08-27", ctx, true)).toBeNull();
  });
});

describe("U034 missing layer", () => {
  it("returns 1–3 Closet suggestions with gap reason", () => {
    const gaps = detectMissingLayers({
      weather: { tempC: 12, condition: "rain" },
      occasion: "WORK",
      owned: { outer: 0, layer: 0 },
    });
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps.length).toBeLessThanOrEqual(3);
    expect(gaps[0]!.gapReason).toMatch(/missing|need|gap/i);
    expect(gaps[0]!.affiliateUrl).toMatch(/closet/);
    const dismissed = detectMissingLayers({
      weather: { tempC: 12 },
      owned: {},
      dismissedIds: ["layer-outer-cold"],
    });
    expect(dismissed.find((g) => g.id === "layer-outer-cold")).toBeUndefined();
  });
});

describe("U035 dispose tree", () => {
  it("resolves keep snooze and sell/donate/barter", () => {
    expect(resolveDisposeTree({ stillWear: true }).nextAction).toBe("keep_snooze");
    expect(resolveDisposeTree({ stillWear: false, hasValue: false }).mode).toBe("DONATE");
    expect(
      resolveDisposeTree({
        stillWear: false,
        hasValue: true,
        preferBarter: true,
      }).mode,
    ).toBe("BARTER");
    expect(
      resolveDisposeTree({
        stillWear: false,
        hasValue: true,
        willingEffort: true,
      }).mode,
    ).toBe("SELL");
    expect(keepSnoozeUntil(new Date("2026-01-01T00:00:00Z"))).toContain("2026-01-31");
    expect(KEEP_SNOOZE_DAYS).toBe(30);
  });
});

describe("U036 cpw threshold", () => {
  it("alerts when CPW above threshold", () => {
    expect(
      cpwAboveThresholdAlert({
        wardrobeItemId: "w1",
        category: "kurta",
        costPerWearMinor: 5000,
        thresholdMinor: 2000,
      })?.disposeDeepLink,
    ).toMatch(/disposition/);
    expect(
      collectCpwThresholdAlerts(
        [{ wardrobeItemId: "a", costPerWearMinor: 100, category: "tee" }],
        50,
      ),
    ).toHaveLength(1);
    expect(
      cpwAboveThresholdAlert({
        wardrobeItemId: "w1",
        costPerWearMinor: 100,
        thresholdMinor: 200,
      }),
    ).toBeNull();
  });
});

describe("U037 measure history", () => {
  it("diffs points and picks latest", () => {
    const diffs = diffMeasurePoints({ bust: 36, waist: 28 }, { bust: 38, waist: 28, hip: 40 });
    expect(diffs).toEqual(
      expect.arrayContaining([
        { key: "bust", from: 36, to: 38 },
        { key: "hip", from: null, to: 40 },
      ]),
    );
    expect(whatChangedNote(diffs, "post festival")).toMatch(/post festival/);
    const latest = latestMeasurement([
      { id: "a", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "b", updatedAt: "2026-08-01T00:00:00Z" },
    ]);
    expect(latest?.id).toBe("b");
  });
});

describe("U038 tailor chase", () => {
  it("timeline, T-1d nudge, mark received", () => {
    const tl = tailorStatusTimeline("SHIPPED");
    expect(tl.find((s) => s.state === "SHIPPED")?.current).toBe(true);
    expect(tailorPickupNudgeDate("2026-08-28")).toBe("2026-08-27");
    expect(
      shouldSendTailorPickupNudge({
        expectedPickupOn: "2026-08-28",
        asOf: "2026-08-27",
        state: "SHIPPED",
      }),
    ).toBe(true);
    expect(canMarkTailorReceived("SHIPPED")).toBe(true);
    expect(canMarkTailorReceived("DELIVERED")).toBe(false);
  });
});

describe("U039 lent overdue actions", () => {
  it("supports nudge / returned / lost", () => {
    expect(lentOverdueActionLabels()).toHaveLength(3);
    const item = { id: "w1", lentTo: "Sam", lentDueOn: "2026-08-01", category: "jacket" };
    expect(applyLentOverdueAction(item, "nudge").ok).toBe(true);
    const lost = applyLentOverdueAction(item, "lost");
    expect(lost.ok && lost.action === "lost" && lost.wasteNote).toMatch(/Lost/);
    const ret = applyLentOverdueAction(item, "returned");
    expect(ret.ok && ret.action === "returned" && ret.patch.lentTo).toBeNull();
  });
});

describe("U040 photo-dump triage", () => {
  it("keep/wardrobe/discard with progress and undo", () => {
    const tags = applyPhotoDumpTriageTags(["photo-dump"], "wardrobe");
    expect(isPhotoDumpTriagePending(tags)).toBe(false);
    const undone = undoPhotoDumpTriageTags(tags);
    expect(isPhotoDumpTriagePending(undone)).toBe(true);
    const progress = photoDumpTriageProgress([
      { tags: applyPhotoDumpTriageTags(["photo-dump"], "keep") },
      { tags: ["photo-dump"] },
      { tags: applyPhotoDumpTriageTags(["photo-dump"], "discard") },
    ]);
    expect(progress.pending).toBe(1);
    expect(progress.keep).toBe(1);
    expect(progress.discard).toBe(1);
  });
});
