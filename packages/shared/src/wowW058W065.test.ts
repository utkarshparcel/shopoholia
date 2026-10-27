import { describe, expect, it } from "vitest";
import { careLabelBadge, formatCareRulesExpanded, parseCareLabel } from "./careLabel.js";
import { buildLentOverdueBanner } from "./borrow-lent.js";
import {
  activeHouseholdSwitcherLabel,
  friendlyHouseholdAclCopy,
} from "./household.js";
import {
  canDeleteClosetProfile,
  profileDeleteConfirmCopy,
} from "./closet-profile.js";
import { buildDryCleanHomeTile, selectDryCleanHomeItems } from "./dry-clean-home.js";
import { buildCompleteLookSheet, platformFromAffiliateUrl } from "./complete-look-sheet.js";
import {
  INITIAL_BULK_IMPORT_PROGRESS,
  bulkImportCanCancel,
  bulkImportProgressLabel,
  reduceBulkImportProgress,
} from "./bulk-import-progress.js";
import {
  applyAutotagEdits,
  buildAutotagConfirmView,
  softDuplicateWarnCopy,
} from "./autotag-confirm.js";

describe("W058–W065 acceptance helpers", () => {
  it("W058 complete-look sheet is Closet-framed with affiliate fills", () => {
    const sheet = buildCompleteLookSheet({
      owned: [{ slot: "top", item: { id: "1", category: "shirt", brand: "Uniqlo" } }],
      missing: [
        {
          slot: "shoes",
          listingId: "l1",
          title: "White sneakers",
          affiliateUrl: "https://www.myntra.com/shoes/1",
          platform: "",
        },
      ],
    });
    expect(sheet.title).toMatch(/complete your look/i);
    expect(sheet.subtitle).toMatch(/closet/i);
    expect(sheet.subtitle.toLowerCase()).not.toMatch(/\bplay\b/);
    expect(sheet.ownedLabels[0]).toMatch(/uniqlo/i);
    expect(sheet.fills).toHaveLength(1);
    expect(sheet.fills[0]!.platform).toBe("myntra");
    expect(platformFromAffiliateUrl("https://www.amazon.in/x")).toBe("amazon");
  });

  it("W059 bulk import progress N/M + cancel + per-item errors", () => {
    let s = reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, {
      type: "start",
      total: 3,
    });
    expect(bulkImportProgressLabel(s)).toBe("0/3");
    expect(bulkImportCanCancel(s)).toBe(true);
    s = reduceBulkImportProgress(s, { type: "item_ok", index: 0 });
    s = reduceBulkImportProgress(s, {
      type: "item_fail",
      index: 1,
      message: "upload failed",
    });
    expect(bulkImportProgressLabel(s)).toBe("2/3");
    expect(s.errors).toHaveLength(1);
    s = reduceBulkImportProgress(s, { type: "cancel" });
    expect(s.phase).toBe("cancelled");
    s = reduceBulkImportProgress(s, { type: "item_ok", index: 2 });
    expect(s.completed).toBe(2); // ignored after cancel
  });

  it("W060 autotag confirm edits + soft dup warn", () => {
    const draft = {
      imageUri: "file://a.jpg",
      category: "shirt",
      colors: ["navy"],
      brand: "Zara",
      confidence: 0.8,
      duplicateWarnings: [{ wardrobeItemId: "w1", score: 0.9 }],
    };
    expect(softDuplicateWarnCopy(draft.duplicateWarnings)).toMatch(/might already/i);
    const view = buildAutotagConfirmView(draft);
    expect(view.softDupWarn).toBeTruthy();
    expect(view.canSave).toBe(true);
    const edited = applyAutotagEdits(draft, { category: "kurta", brand: "  " });
    expect(edited.category).toBe("kurta");
    expect(edited.brand).toBeNull();
  });

  it("W061 care badge when rules present; expand formats", () => {
    const rules = parseCareLabel("Machine wash cold\nDo not dry clean");
    expect(careLabelBadge(rules)).toBe("Cold wash");
    expect(careLabelBadge(null)).toBeNull();
    expect(formatCareRulesExpanded(rules)).toMatch(/Wash machine_cold/);
    expect(careLabelBadge(parseCareLabel("Dry clean only"))).toBe("Dry-clean");
  });

  it("W062 dry-clean home tile when IN_LAUNDRY + pickup", () => {
    const items = [
      {
        id: "a",
        category: "blazer",
        laundryStatus: "IN_LAUNDRY" as const,
        dryCleanTicket: "T9",
        dryCleanPickupOn: "2026-08-28",
      },
      {
        id: "b",
        category: "shirt",
        laundryStatus: "DIRTY" as const,
        dryCleanPickupOn: "2026-08-27",
      },
    ];
    expect(selectDryCleanHomeItems(items)).toHaveLength(1);
    const tile = buildDryCleanHomeTile(items);
    expect(tile?.itemId).toBe("a");
    expect(tile?.headline).toMatch(/dry-clean pickup/i);
    expect(tile?.body).toMatch(/T9/);
    expect(buildDryCleanHomeTile([])).toBeNull();
  });

  it("W063 lent overdue banner → return primary", () => {
    const banner = buildLentOverdueBanner(
      [
        { id: "1", lentTo: "Priya", lentDueOn: "2026-08-01" },
        { id: "2", lentTo: "Asha", lentDueOn: "2026-08-10" },
        { id: "3", lentTo: "Sam", lentDueOn: "2026-09-01" },
      ],
      "2026-08-26",
    );
    expect(banner?.count).toBe(2);
    expect(banner?.primaryItemId).toBe("1");
    expect(banner?.body).toMatch(/returned/i);
  });

  it("W064 household switcher + friendly 403 ACL", () => {
    expect(activeHouseholdSwitcherLabel({ name: "Our home" })).toBe("Active: Our home");
    expect(activeHouseholdSwitcherLabel(null)).toMatch(/no household/i);
    expect(friendlyHouseholdAclCopy("NOT_MEMBER")).toMatch(/invite/i);
    expect(friendlyHouseholdAclCopy("Not a member of this household")).toMatch(/invite/i);
    expect(friendlyHouseholdAclCopy("Forbidden")).toMatch(/access/i);
  });

  it("W065 kids profile delete confirm + SELF guard", () => {
    expect(canDeleteClosetProfile({ kind: "SELF" })).toBe(false);
    expect(canDeleteClosetProfile({ kind: "KID" })).toBe(true);
    const copy = profileDeleteConfirmCopy({ name: "Ara", kind: "KID" });
    expect(copy.title).toMatch(/kids profile/i);
    expect(copy.body).toMatch(/Ara/);
    expect(copy.confirmLabel).toMatch(/delete/i);
  });
});
