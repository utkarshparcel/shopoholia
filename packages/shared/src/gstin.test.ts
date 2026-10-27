import { describe, expect, it } from "vitest";
import { extractGstin, isValidGstin, normalizeGstin, readReceiptGstin } from "./gstin.js";
import { filterReceiptsForSearch } from "./receipt-search.js";
import { buildInvoicePdfBytes } from "./invoice-pdf.js";

describe("gstin", () => {
  it("normalizes and validates GSTIN", () => {
    expect(normalizeGstin("29aabcu9603r1zm")).toBe("29AABCU9603R1ZM");
    expect(isValidGstin("29AABCU9603R1ZM")).toBe(true);
    expect(isValidGstin("not-a-gstin")).toBe(false);
  });

  it("extracts GSTIN from invoice text", () => {
    expect(
      extractGstin("Tax invoice\nGSTIN: 29AABCU9603R1ZM\nTotal ₹1,299"),
    ).toBe("29AABCU9603R1ZM");
  });

  it("extracts bare GSTIN and rejects invalid labeled tokens", () => {
    expect(extractGstin("Seller 29AABCU9603R1ZM billed")).toBe("29AABCU9603R1ZM");
    // entity digit must be 1-9/A-Z — 0 fails the shape regex
    expect(extractGstin("GSTIN: 29AAAAA0000A0ZA")).toBeNull();
    expect(extractGstin("no tax id here")).toBeNull();
  });

  it("reads gstin from ocrJson", () => {
    expect(
      readReceiptGstin({ ocrJson: { gstin: "27AAPFU0939F1ZV" } }),
    ).toBe("27AAPFU0939F1ZV");
  });

  it("prefers explicit gstin then ocr text / rawText", () => {
    expect(readReceiptGstin({ gstin: " 29aabcu9603r1zm " })).toBe("29AABCU9603R1ZM");
    expect(
      readReceiptGstin({ ocrJson: { text: "GSTIN 29AABCU9603R1ZM" } }),
    ).toBe("29AABCU9603R1ZM");
    expect(
      readReceiptGstin({ ocrJson: { rawText: "GSTIN: 27AAPFU0939F1ZV" } }),
    ).toBe("27AAPFU0939F1ZV");
    expect(readReceiptGstin({ gstin: null, ocrJson: {} })).toBeNull();
  });
});

describe("filterReceiptsForSearch", () => {
  const rows = [
    {
      id: "1",
      merchant: "Myntra",
      purchasedAt: "2026-01-15T10:00:00.000Z",
      ocrJson: { gstin: "29AABCU9603R1ZM" },
    },
    {
      id: "2",
      merchant: "Amazon",
      purchasedAt: "2026-03-01T10:00:00.000Z",
      ocrJson: { gstin: "27AAPFU0939F1ZV" },
    },
    {
      id: "3",
      merchant: "Flipkart Fashion",
      purchasedAt: "2026-02-10T10:00:00.000Z",
      ocrJson: {},
    },
  ];

  it("filters by merchant contains", () => {
    expect(filterReceiptsForSearch(rows, { merchant: "myn" }).map((r) => r.id)).toEqual([
      "1",
    ]);
  });

  it("filters by date range", () => {
    expect(
      filterReceiptsForSearch(rows, { from: "2026-02-01", to: "2026-02-28" }).map(
        (r) => r.id,
      ),
    ).toEqual(["3"]);
  });

  it("filters by GSTIN", () => {
    expect(
      filterReceiptsForSearch(rows, { gstin: "29AABCU9603R1ZM" }).map((r) => r.id),
    ).toEqual(["1"]);
  });

  it("combines merchant + gstin", () => {
    expect(
      filterReceiptsForSearch(rows, { merchant: "Amazon", gstin: "27AAPFU" }).map(
        (r) => r.id,
      ),
    ).toEqual(["2"]);
  });

  it("accepts Date purchasedAt and ISO datetime bounds", () => {
    const withDate = [
      {
        id: "d1",
        merchant: "Nykaa",
        purchasedAt: new Date("2026-04-15T12:00:00.000Z"),
        gstin: "29AABCU9603R1ZM",
      },
    ];
    expect(
      filterReceiptsForSearch(withDate, {
        from: "2026-04-01T00:00:00.000Z",
        to: "2026-04-30T23:59:59.999Z",
      }).map((r) => r.id),
    ).toEqual(["d1"]);
    expect(
      filterReceiptsForSearch(withDate, { to: "2026-04-01T00:00:00.000Z" }),
    ).toEqual([]);
  });
});

describe("buildInvoicePdfBytes", () => {
  it("emits a PDF header", () => {
    const bytes = buildInvoicePdfBytes({
      merchant: "Mock Mart",
      purchasedAt: "2026-08-26",
      totalLabel: "₹1,299.00",
      gstin: "29AABCU9603R1ZM",
      receiptId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Mock Mart");
    expect(text).toContain("29AABCU9603R1ZM");
  });
});
