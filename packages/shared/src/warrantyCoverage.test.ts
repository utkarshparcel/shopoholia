import { describe, expect, it } from "vitest";
import {
  WARRANTY_COVERAGE_PRESETS,
  coverageUntilFromCategory,
  draftWarrantiesFromCategoryRules,
  inferWarrantyCategory,
} from "./warrantyCoverage.js";

describe("inferWarrantyCategory", () => {
  it("maps electronics / appliances / apparel from titles", () => {
    expect(inferWarrantyCategory("Wireless Headphones")).toBe("electronics");
    expect(inferWarrantyCategory("Front-load Washer")).toBe("appliances");
    expect(inferWarrantyCategory("Cotton T-Shirt")).toBe("apparel");
  });

  it("respects explicit OCR category hints", () => {
    expect(inferWarrantyCategory("Thing", "electronics")).toBe("electronics");
    expect(inferWarrantyCategory("Thing", "top")).toBe("apparel");
    expect(inferWarrantyCategory("Thing", "consumer electronics")).toBe("electronics");
    expect(inferWarrantyCategory("Thing", "home appliance")).toBe("appliances");
    expect(inferWarrantyCategory("Thing", "apparel")).toBe("apparel");
    expect(inferWarrantyCategory("Thing", "bottom")).toBe("apparel");
  });

  it("returns null when title and hint do not match", () => {
    expect(inferWarrantyCategory("Mystery SKU", "misc")).toBeNull();
  });
});

describe("coverageUntilFromCategory", () => {
  it("applies preset months", () => {
    const purchasedAt = "2026-01-01T00:00:00.000Z";
    const electronics = coverageUntilFromCategory(purchasedAt, "electronics");
    const appliances = coverageUntilFromCategory(purchasedAt, "appliances");
    const apparel = coverageUntilFromCategory(purchasedAt, "apparel");
    expect(electronics.getTime() - Date.parse(purchasedAt)).toBe(
      WARRANTY_COVERAGE_PRESETS.electronics.months * 30 * 86_400_000,
    );
    expect(appliances.getTime() - Date.parse(purchasedAt)).toBe(
      WARRANTY_COVERAGE_PRESETS.appliances.months * 30 * 86_400_000,
    );
    expect(apparel.getTime() - Date.parse(purchasedAt)).toBe(
      WARRANTY_COVERAGE_PRESETS.apparel.months * 30 * 86_400_000,
    );
  });

  it("honors monthsOverride", () => {
    const purchasedAt = new Date("2026-01-01T00:00:00.000Z");
    const until = coverageUntilFromCategory(purchasedAt, "apparel", 3);
    expect(until.getTime() - purchasedAt.getTime()).toBe(3 * 30 * 86_400_000);
  });
});

describe("draftWarrantiesFromCategoryRules (U010)", () => {
  it("drafts editable warranties from title category rules", () => {
    const drafts = draftWarrantiesFromCategoryRules(
      [
        { title: "Wireless Headphones" },
        { title: "Mystery SKU" },
        { title: "Cotton T-Shirt" },
      ],
      "2026-01-01T00:00:00.000Z",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.itemIndex).toBe(0);
    expect(drafts[0]!.category).toBe("electronics");
    expect(drafts[1]!.itemIndex).toBe(2);
    expect(drafts[1]!.category).toBe("apparel");
  });

  it("uses OCR category on items and appliance title matches", () => {
    const drafts = draftWarrantiesFromCategoryRules(
      [
        { title: "SKU-1", category: "appliances" },
        { title: "Inverter AC unit", category: null },
      ],
      new Date("2026-02-01T00:00:00.000Z"),
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.category).toBe("appliances");
    expect(drafts[0]!.months).toBe(WARRANTY_COVERAGE_PRESETS.appliances.months);
    expect(drafts[1]!.category).toBe("appliances");
    expect(inferWarrantyCategory("Gaming console")).toBe("electronics");
    expect(inferWarrantyCategory("Denim jeans")).toBe("apparel");
  });
});
