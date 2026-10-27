import { describe, expect, it } from "vitest";
import {
  buildClosetAffiliateClickId,
  isClosetAffiliateSource,
  platformFromAffiliateUrl,
  platformFromMerchant,
} from "./closet-affiliate.js";

describe("MON-AFFILIATE-CLOSET click helpers", () => {
  it("recognizes Closet affiliate sources", () => {
    expect(isClosetAffiliateSource("vault_use_it_now")).toBe(true);
    expect(isClosetAffiliateSource("replace_twin")).toBe(true);
    expect(isClosetAffiliateSource("missing_piece")).toBe(true);
    expect(isClosetAffiliateSource("play_listing")).toBe(false);
  });

  it("maps merchant labels to platforms", () => {
    expect(platformFromMerchant("Amazon.in")).toBe("amazon");
    expect(platformFromMerchant("Flipkart")).toBe("flipkart");
    expect(platformFromMerchant("MYNTRA")).toBe("myntra");
    expect(platformFromMerchant("")).toBe("other");
  });

  it("infers platform from affiliate URL", () => {
    expect(platformFromAffiliateUrl("https://www.myntra.com/black-trousers?ref=shopoholia")).toBe(
      "myntra",
    );
    expect(platformFromAffiliateUrl("https://www.amazon.in/s?k=belt&tag=shopoholia-21")).toBe(
      "amazon",
    );
    expect(platformFromAffiliateUrl("not-a-url")).toBe("other");
  });

  it("builds unique Closet cashback click ids", () => {
    const a = buildClosetAffiliateClickId("vault_use_it_now", "amazon");
    const b = buildClosetAffiliateClickId("vault_use_it_now", "amazon");
    expect(a).toMatch(/^closet:vault_use_it_now:amazon:nolisting:/);
    expect(a).not.toBe(b);
    const withListing = buildClosetAffiliateClickId("replace_twin", "myntra", {
      listingId: "11111111-1111-1111-1111-111111111111",
    });
    expect(withListing).toContain("11111111-1111-1111-1111-111111111111");
  });
});
