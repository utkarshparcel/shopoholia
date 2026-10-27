import { describe, it, expect } from "vitest";
import {
  similarityScore,
  findDuplicateMatches,
  findDuplicateWarnings,
  normalizeText,
  ownedLabel,
  playDupRebuyBanner,
  DUP_REBUY_CLOSET_HREF,
  DUP_REBUY_SOFT_FOOTER,
} from "./dup-rebuy.js";
import {
  merchantWindowsDiffer,
  returnWindowDays,
  exchangeWindowDays,
  computeReturnWindowDeadline,
  computeExchangeWindowDeadline,
  daysLeft,
} from "./exchange-windows.js";
import { detectDeliveryFromText } from "./package-delivery.js";

describe("dup-rebuy", () => {
  it("scores exact titles high", () => {
    expect(similarityScore("Zara Linen Shirt", "Zara Linen Shirt")).toBeGreaterThanOrEqual(0.9);
  });

  it("boosts matching brands", () => {
    const withBrand = similarityScore("Linen Shirt Blue", "Linen Shirt", "Zara", "Zara");
    const without = similarityScore("Linen Shirt Blue", "Linen Shirt", null, null);
    expect(withBrand).toBeGreaterThan(without);
  });

  it("finds wardrobe brand+category match", () => {
    const owned = [
      {
        id: "00000000-0000-4000-8000-0000000000aa",
        brand: "Zara",
        category: "Shirt",
        title: null,
      },
    ];
    const hit = findDuplicateMatches(
      { title: "Zara Slim Fit Shirt", brand: "Zara" },
      owned,
      0.4,
    );
    expect(hit).not.toBeNull();
    expect(hit!.matches.length).toBeGreaterThan(0);
  });

  it("returns empty when no overlap", () => {
    expect(
      findDuplicateWarnings(
        [{ title: "Completely Unique Gadget XYZ" }],
        [{ id: "00000000-0000-4000-8000-0000000000bb", title: "Winter Coat", brand: "Uniqlo" }],
      ),
    ).toEqual([]);
  });

  it("normalizes punctuation", () => {
    expect(normalizeText("H&M!")).toBe("h m");
  });

  it("boosts when brand appears inside the other title", () => {
    const score = similarityScore("Linen Shirt", "Zara Linen Shirt Blue", null, "Zara");
    expect(score).toBeGreaterThan(0.2);
    const reverse = similarityScore("Nike Air Max", "Air shoes", null, "Nike");
    expect(reverse).toBeGreaterThan(0.2);
    // candidate brand token appears inside owned title
    const brandInOwned = similarityScore("Linen Tee", "Zara Linen Shirt", "Zara", null);
    expect(brandInOwned).toBeGreaterThan(0.2);
    const brandInCand = similarityScore("Zara Linen Shirt", "Linen Tee", "Zara", null);
    expect(brandInCand).toBeGreaterThan(0.2);
  });

  it("falls back to brand-only similarity when titles are stopwords", () => {
    expect(similarityScore("the", "a", "Zara", "Zara")).toBe(0.55);
    expect(similarityScore("the", "a", "Zara", "H&M")).toBe(0);
  });

  it("labels owned items from brand + category fallback", () => {
    expect(ownedLabel({ id: "1", brand: "Zara", category: "Shirt", title: null })).toBe(
      "Zara Shirt",
    );
    expect(ownedLabel({ id: "2" })).toBe("wardrobe item");
  });

  it("classifies title_exact and title_overlap reasons", () => {
    const exact = findDuplicateMatches(
      { title: "Blue Linen Shirt" },
      [{ id: "1", title: "Blue Linen Shirt", brand: null }],
      0.5,
    );
    expect(exact?.matches[0]?.reason).toBe("title_exact");

    const overlap = findDuplicateMatches(
      { title: "Cotton tee blue", brand: "A" },
      [{ id: "2", title: "Cotton tee blue striped", brand: "B" }],
      0.5,
    );
    expect(overlap?.matches[0]?.reason).toBe("title_overlap");
    expect(overlap?.matches[0]?.score).toBeLessThan(0.9);

    const branded = findDuplicateMatches(
      { title: "Blue Linen Shirt", brand: "Zara", listingId: "L1", purchaseItemId: "P1" },
      [{ id: "3", title: "Blue Linen Shirt", brand: "Zara" }],
      0.5,
    );
    expect(branded?.matches[0]?.reason).toBe("brand_and_title");
    expect(branded?.listingId).toBe("L1");
    expect(branded?.purchaseItemId).toBe("P1");
  });

  it("W040 playDupRebuyBanner: soft copy + Closet deep link; never blocks pay", () => {
    expect(playDupRebuyBanner({ overlaps: [], warnings: [] })).toBeNull();

    const one = playDupRebuyBanner({
      overlaps: [
        {
          candidateTitle: "Navy Linen Shirt",
          wardrobeLabel: "Zara Shirt",
          wardrobeItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
      ],
    });
    expect(one).not.toBeNull();
    expect(one!.kicker).toMatch(/already own/i);
    expect(one!.message).toMatch(/Navy Linen Shirt/);
    expect(one!.detail).toMatch(/Zara Shirt/);
    expect(one!.softNote).toBe(DUP_REBUY_SOFT_FOOTER);
    expect(one!.softNote.toLowerCase()).toMatch(/still pay/);
    expect(one!.softNote.toLowerCase()).not.toMatch(/cannot|blocked|must/);
    expect(one!.closetHref).toBe(DUP_REBUY_CLOSET_HREF);
    expect(one!.closetHref).toMatch(/\(closet\)\/wardrobe/);
    expect(one!.closetLabel).toMatch(/Closet/i);
    expect(one!.blocksPay).toBe(false);

    const many = playDupRebuyBanner({
      warnings: [
        {
          candidateTitle: "Tee A",
          matches: [{ wardrobeLabel: "Owned Tee", wardrobeItemId: "b" }],
        },
        {
          candidateTitle: "Tee B",
          matches: [{ wardrobeLabel: "Other Tee" }],
        },
      ],
    });
    expect(many!.message).toMatch(/2 haul items/);
    expect(many!.blocksPay).toBe(false);
  });
});

describe("exchange-windows", () => {
  it("exchange ≠ return for key India merchants", () => {
    for (const m of ["Flipkart", "Myntra", "Ajio", "H&M"]) {
      expect(merchantWindowsDiffer(m)).toBe(true);
      expect(returnWindowDays(m)).not.toBe(exchangeWindowDays(m));
    }
  });

  it("falls back via underscore-stripped keys and defaults", () => {
    expect(returnWindowDays("H M")).toBe(14);
    expect(returnWindowDays("Ama_zon")).toBe(30);
    expect(returnWindowDays("unknown_shop")).toBe(14);
    expect(exchangeWindowDays("Flip_kart")).toBe(10);
    expect(exchangeWindowDays("unknown_shop")).toBe(14);
    expect(merchantWindowsDiffer("Amazon")).toBe(false);
  });

  it("computes deadlines and daysLeft", () => {
    const purchased = new Date("2026-08-01T00:00:00.000Z");
    const ret = computeReturnWindowDeadline(purchased, "Flipkart");
    const ex = computeExchangeWindowDeadline(purchased, "Flipkart");
    expect(ret.toISOString()).toBe("2026-08-08T00:00:00.000Z");
    expect(ex.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(daysLeft(ret, new Date("2026-08-05T00:00:00.000Z"))).toBe(3);
    expect(daysLeft(null)).toBeNull();
  });
});

describe("package-delivery text", () => {
  it("maps shipped / out for delivery / delivered", () => {
    expect(detectDeliveryFromText("Shipped", "Your order has shipped").deliveryStatus).toBe(
      "SHIPPED",
    );
    expect(
      detectDeliveryFromText("Update", "Out for delivery today").deliveryStatus,
    ).toBe("OUT_FOR_DELIVERY");
    expect(
      detectDeliveryFromText("Done", "Successfully delivered").deliveryStatus,
    ).toBe("DELIVERED");
  });
});
