import { describe, expect, it } from "vitest";
import { buildCompleteLookSheet, platformFromAffiliateUrl } from "./complete-look-sheet.js";

describe("complete-look-sheet", () => {
  it("infers platforms and falls back on bad URLs", () => {
    expect(platformFromAffiliateUrl("https://www.amazon.in/dp/1")).toBe("amazon");
    expect(platformFromAffiliateUrl("https://www.flipkart.com/x")).toBe("flipkart");
    expect(platformFromAffiliateUrl("https://www.myntra.com/x")).toBe("myntra");
    expect(platformFromAffiliateUrl("https://other.example/x")).toBe("other");
    expect(platformFromAffiliateUrl("https://other.example/x", "ajio")).toBe("ajio");
    expect(platformFromAffiliateUrl("not a url")).toBe("other");
  });

  it("builds Closet-framed sheet with empty-fill hints", () => {
    const withOwnedNoFills = buildCompleteLookSheet({
      owned: [{ slot: "top", item: { id: "1", category: "shirt" } }],
      missing: [
        {
          slot: "shoes",
          listingId: "l1",
          title: "Sneakers",
          affiliateUrl: "  ",
          platform: "myntra",
        },
      ],
      summary: "  Custom summary  ",
    });
    expect(withOwnedNoFills.subtitle).toBe("Custom summary");
    expect(withOwnedNoFills.ownedLabels[0]).toBe("top: shirt");
    expect(withOwnedNoFills.fills).toHaveLength(0);
    expect(withOwnedNoFills.emptyFillsHint).toMatch(/already covers/i);

    const emptyCloset = buildCompleteLookSheet({ owned: [], missing: [] });
    expect(emptyCloset.emptyFillsHint).toMatch(/Add a few pieces/i);
    expect(emptyCloset.subtitle).toMatch(/closet/i);

    const withFills = buildCompleteLookSheet({
      owned: [{ slot: "top", item: { id: "1", category: "tee", brand: "  Uniqlo  " } }],
      missing: [
        {
          slot: "bag",
          listingId: "l2",
          title: "Tote",
          affiliateUrl: "https://www.amazon.in/tote",
          platform: "  ",
        },
      ],
    });
    expect(withFills.ownedLabels[0]).toMatch(/Uniqlo/);
    expect(withFills.fills[0]).toMatchObject({
      platform: "amazon",
      ctaLabel: "Fill bag",
      affiliateUrl: "https://www.amazon.in/tote",
    });
    expect(withFills.emptyFillsHint).toBeNull();
  });
});
