import { describe, expect, it } from "vitest";
import {
  buildPriceDropAlertCard,
  listingMatchesBrand,
  normalizeBrandKey,
  priceDropAmountMinor,
  priceDropDismissKey,
  priceDropThresholdMet,
  PRICE_DROP_DISMISS_REASONS,
  isPriceDropDismissReason,
} from "./price-drop.js";

describe("priceDropThresholdMet", () => {
  it("fires at exact threshold", () => {
    // 10% of 10000 = 1000 → current 9000 meets 10%
    expect(priceDropThresholdMet(10_000, 9_000, 10)).toBe(true);
  });

  it("does not fire below threshold", () => {
    expect(priceDropThresholdMet(10_000, 9_500, 10)).toBe(false);
  });

  it("fires above threshold", () => {
    expect(priceDropThresholdMet(10_000, 7_000, 10)).toBe(true);
  });

  it("rejects invalid baselines", () => {
    expect(priceDropThresholdMet(0, 100, 10)).toBe(false);
    expect(priceDropThresholdMet(-1, 100, 10)).toBe(false);
  });

  it("threshold 0 means any drop", () => {
    expect(priceDropThresholdMet(100, 99, 0)).toBe(true);
    expect(priceDropThresholdMet(100, 100, 0)).toBe(false);
  });
});

describe("priceDropAmountMinor", () => {
  it("returns positive drop only", () => {
    expect(priceDropAmountMinor(500, 400)).toBe(100);
    expect(priceDropAmountMinor(500, 600)).toBe(0);
  });
});

describe("listingMatchesBrand", () => {
  it("matches title and tags", () => {
    expect(normalizeBrandKey("  H&M ")).toBe("h&m");
    expect(listingMatchesBrand("H&M", { title: "H&M Navy Shirt", tags: [] })).toBe(true);
    expect(listingMatchesBrand("Zara", { title: "Cotton Tee", tags: ["zara", "sale"] })).toBe(
      true,
    );
    expect(listingMatchesBrand("Nike", { title: "Adidas runners", tags: [] })).toBe(false);
  });
});

describe("price drop alert card (W029)", () => {
  it("builds soft card + dismiss keys", () => {
    expect(priceDropDismissKey("l1")).toBe("price-drop:l1");
    expect(priceDropDismissKey("l1", "w1")).toBe("price-drop:w1:l1");
    const card = buildPriceDropAlertCard({
      listingId: "l1",
      brand: "Zara",
      listingTitle: "Linen Shirt",
      dropPct: 12.4,
      thresholdPct: 10,
      watchedPriceMinor: 2000,
      currentPriceMinor: 1750,
      watchId: "w1",
    });
    expect(card.headline).toBe("Zara dropped 12%");
    expect(card.dismissKey).toBe("price-drop:w1:l1");
    expect(card.body).toContain("10%");
    expect(PRICE_DROP_DISMISS_REASONS).toContain("TOO_EXPENSIVE");
    expect(isPriceDropDismissReason("WRONG_SIZE")).toBe(true);
    expect(isPriceDropDismissReason("nope")).toBe(false);
  });
});
