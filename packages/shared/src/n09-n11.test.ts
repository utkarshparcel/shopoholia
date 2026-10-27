import { describe, expect, it } from "vitest";
import {
  computeExchangeWindowDeadline,
  computeReturnWindowDeadline,
  daysLeft,
  detectDeliveryFromText,
  exchangeWindowDays,
  findDuplicateMatches,
  merchantWindowsDiffer,
  normalizeText,
  returnWindowDays,
  similarityScore,
  tokenize,
} from "./index.js";

describe("package-delivery detect", () => {
  it("parses out for delivery + tracking", () => {
    const d = detectDeliveryFromText(
      "Out for delivery",
      "Your AWB: XYZ987654321 is out for delivery",
    );
    expect(d.deliveryStatus).toBe("OUT_FOR_DELIVERY");
    expect(d.trackingCode).toBe("XYZ987654321");
  });
});

describe("exchange-windows", () => {
  it("keeps Amazon return === exchange; Flipkart differs", () => {
    expect(returnWindowDays("Amazon")).toBe(exchangeWindowDays("Amazon"));
    expect(merchantWindowsDiffer("amazon")).toBe(false);
    expect(returnWindowDays("flipkart")).toBe(7);
    expect(exchangeWindowDays("flipkart")).toBe(10);
    expect(merchantWindowsDiffer("flipkart")).toBe(true);
  });

  it("compute deadlines from purchasedAt", () => {
    const t = new Date("2025-06-01T00:00:00.000Z");
    const r = computeReturnWindowDeadline(t, "Ajio");
    const e = computeExchangeWindowDeadline(t, "Ajio");
    expect(e.getTime()).toBeLessThan(r.getTime());
    expect(daysLeft(e, t)).toBe(7);
    expect(daysLeft(r, t)).toBe(15);
  });
});

describe("dup-rebuy", () => {
  it("tokenizes and scores brand+title", () => {
    expect(tokenize("The Navy Cotton Shirt").includes("navy")).toBe(true);
    expect(normalizeText("H&M")).toBe("h m");
    const score = similarityScore(
      "Zara Linen Blazer Beige",
      "Linen Blazer",
      "Zara",
      "Zara",
    );
    expect(score).toBeGreaterThanOrEqual(0.55);
    const m = findDuplicateMatches(
      { title: "Zara Linen Blazer Beige", brand: "Zara" },
      [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          brand: "Zara",
          category: "Blazer",
          title: "Linen Blazer Beige",
        },
      ],
    );
    expect(m?.matches[0]?.wardrobeBrand).toBe("Zara");
  });

  it("does not false-positive unrelated titles", () => {
    const m = findDuplicateMatches(
      { title: "Blue Ceramic Mug", brand: "Generic" },
      [
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          brand: "Nike",
          category: "Shoes",
          title: "Air Max",
        },
      ],
    );
    expect(m).toBeNull();
  });
});
