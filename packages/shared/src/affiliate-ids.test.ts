import { describe, expect, it } from "vitest";
import { affiliateIdsFromEnv, tagAffiliateUrl } from "./affiliate-ids.js";
import { detectMissingLayers } from "./missing-layer.js";
import { buildSeedListings } from "./seed/listings.js";

describe("affiliate ids from config", () => {
  it("reads only configured, non-blank ids", () => {
    expect(affiliateIdsFromEnv({})).toEqual({});
    expect(
      affiliateIdsFromEnv({ AFFILIATE_AMAZON_TAG: " worn-21 ", AFFILIATE_FLIPKART_ID: "  " }),
    ).toEqual({ amazon: "worn-21" });
  });

  it("tags a URL with the platform's parameter, and leaves it alone without an id", () => {
    expect(tagAffiliateUrl("amazon", "https://www.amazon.in/s?k=belt", {})).toBe(
      "https://www.amazon.in/s?k=belt",
    );
    expect(tagAffiliateUrl("amazon", "https://www.amazon.in/s?k=belt", { amazon: "worn-21" })).toBe(
      "https://www.amazon.in/s?k=belt&tag=worn-21",
    );
    expect(tagAffiliateUrl("myntra", "https://www.myntra.com/blazer", { myntra: "worn" })).toBe(
      "https://www.myntra.com/blazer?ref=worn",
    );
  });

  it("missing-layer and seed links carry no placeholder id", () => {
    const gaps = detectMissingLayers({ weather: { tempC: 10 }, owned: {} });
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(g.affiliateUrl).not.toMatch(/[?&](ref|tag|affid|affiliate|utm_source)=/);
    }
    const tagged = detectMissingLayers({
      weather: { tempC: 10 },
      owned: {},
      affiliateIds: { myntra: "worn" },
    });
    expect(tagged[0]!.affiliateUrl).toMatch(/\?ref=worn$/);

    const links = buildSeedListings(10).flatMap((l) => l.affiliateLinks ?? []);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.url).not.toMatch(/shopoholia|[?&](tag|affid|affiliate|utm_source)=/);
    }
    const amazon = buildSeedListings(10, { affiliateIds: { amazon: "worn-21" } })
      .flatMap((l) => l.affiliateLinks ?? [])
      .find((l) => l.platform === "amazon");
    expect(amazon?.url).toMatch(/tag=worn-21/);
  });
});
