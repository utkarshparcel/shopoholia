import { describe, expect, it } from "vitest";
import {
  buildStoreZip,
  buildWorkwearTaxPack,
  isDateInRange,
  resolveTaxPackRange,
} from "./tax-pack.js";

describe("tax-pack (N44-TAX-PACK)", () => {
  it("resolveTaxPackRange supports year and from/to date range", () => {
    const year = resolveTaxPackRange({ year: 2025 });
    expect("error" in year).toBe(false);
    if ("error" in year) return;
    expect(year.label).toBe("2025");
    expect(year.from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(year.to.toISOString()).toBe("2025-12-31T23:59:59.999Z");

    const custom = resolveTaxPackRange({ from: "2025-04-01", to: "2026-03-31" });
    expect("error" in custom).toBe(false);
    if ("error" in custom) return;
    expect(custom.year).toBeNull();
    expect(custom.from.toISOString().startsWith("2025-04-01")).toBe(true);
    expect(custom.to.toISOString().startsWith("2026-03-31")).toBe(true);

    expect(resolveTaxPackRange({ from: "2025-01-01" })).toEqual({
      error: "from and to are both required when using a custom range",
    });
    expect(resolveTaxPackRange({ from: "2026-01-01", to: "2025-01-01" })).toEqual({
      error: "from must be on or before to",
    });
  });

  it("isDateInRange is inclusive on boundaries", () => {
    const from = new Date("2025-01-01T00:00:00.000Z");
    const to = new Date("2025-12-31T23:59:59.999Z");
    expect(isDateInRange(new Date("2025-01-01T00:00:00.000Z"), from, to)).toBe(true);
    expect(isDateInRange(new Date("2025-12-31T23:59:59.999Z"), from, to)).toBe(true);
    expect(isDateInRange(new Date("2024-12-31T23:59:59.999Z"), from, to)).toBe(false);
    expect(isDateInRange(new Date("2026-01-01T00:00:00.000Z"), from, to)).toBe(false);
  });

  it("buildWorkwearTaxPack filters spend + invoices by date range", () => {
    const range = resolveTaxPackRange({ year: 2025 });
    if ("error" in range) throw new Error(range.error);

    const purchaseItemId = "11111111-1111-4111-8111-111111111111";
    const purchaseId = "22222222-2222-4222-8222-222222222222";
    const purchaseIdByItemId = new Map([[purchaseItemId, purchaseId]]);

    const pack = buildWorkwearTaxPack({
      range,
      wardrobeItems: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          category: "blazer",
          tags: ["workwear"],
          costMinor: 500000,
          brand: "Van Heusen",
          createdAt: new Date("2025-06-15T10:00:00.000Z"),
          purchaseItemId,
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          category: "tee",
          tags: ["casual"],
          costMinor: 80000,
          brand: "H&M",
          createdAt: new Date("2025-06-15T10:00:00.000Z"),
        },
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          category: "oxford",
          tags: ["office"],
          costMinor: 200000,
          brand: null,
          createdAt: new Date("2024-11-01T10:00:00.000Z"), // out of range
          purchaseItemId,
        },
      ],
      receipts: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          merchant: "Myntra",
          purchasedAt: new Date("2025-06-15T09:00:00.000Z"),
          totalMinor: 500000,
          imageKey: "r/in.jpg",
          purchaseId,
          ocrJson: { gstin: "29AABCU9603R1ZM" },
        },
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          merchant: "Amazon",
          purchasedAt: new Date("2024-06-01T09:00:00.000Z"), // out of range
          totalMinor: 10000,
          imageKey: "r/out.jpg",
          purchaseId,
          ocrJson: {},
        },
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          merchant: "Nykaa",
          purchasedAt: new Date("2025-07-01T09:00:00.000Z"),
          totalMinor: 3000,
          imageKey: "r/unrelated.jpg",
          purchaseId: "33333333-3333-4333-8333-333333333333",
          ocrJson: {},
        },
      ],
      purchaseIdByItemId,
    });

    expect(pack.spendRowCount).toBe(1);
    expect(pack.spend[0]!.category).toBe("blazer");
    expect(pack.totalSpendMinor).toBe(500000);
    expect(pack.invoiceCount).toBe(1);
    expect(pack.invoices[0]!.merchant).toBe("Myntra");
    expect(pack.invoices[0]!.gstin).toBe("29AABCU9603R1ZM");
    expect(pack.spendCsv).toContain("blazer");
    expect(pack.spendCsv).not.toContain("tee");
    expect(pack.invoicesCsv).toContain("Myntra");
    expect(pack.invoicesCsv).not.toContain("Nykaa");
  });

  it("custom from/to excludes items outside the window", () => {
    const range = resolveTaxPackRange({ from: "2025-01-01", to: "2025-03-31" });
    if ("error" in range) throw new Error(range.error);
    const pack = buildWorkwearTaxPack({
      range,
      wardrobeItems: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          category: "formal trousers",
          tags: ["work"],
          costMinor: 100000,
          brand: null,
          createdAt: new Date("2025-02-10T00:00:00.000Z"),
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          category: "blazer",
          tags: ["workwear"],
          costMinor: 200000,
          brand: null,
          createdAt: new Date("2025-08-10T00:00:00.000Z"),
        },
      ],
      receipts: [],
    });
    expect(pack.spendRowCount).toBe(1);
    expect(pack.totalSpendMinor).toBe(100000);
    expect(pack.label).toContain("2025-01-01");
  });

  it("buildStoreZip produces a recognizable ZIP header", () => {
    const zip = buildStoreZip([
      { name: "spend.csv", content: "a,b\n1,2\n" },
      { name: "invoices.csv", content: "id\nx\n" },
    ]);
    // Local file header signature PK\x03\x04
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    expect(zip.length).toBeGreaterThan(50);
  });
});
