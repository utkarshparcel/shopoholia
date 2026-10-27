import { describe, expect, it } from "vitest";
import type {
  BrandPriceWatch,
  BrandPriceWatchListResponse,
  PriceDropScanResponse,
} from "@worn/shared";
import { priceDropThresholdMet } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";
import { evaluateWatchAgainstListings } from "../lib/price-drop.js";

describe("N12 price-drop threshold", () => {
  it("meets exact threshold", () => {
    expect(priceDropThresholdMet(10_000, 9_000, 10)).toBe(true);
    expect(priceDropThresholdMet(10_000, 9_100, 10)).toBe(false);
  });
});

describe("price-watches routes", () => {
  it("creates watch and scans catalog for threshold hits", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const seller = await repos.registerSeller(userId, "Drop Shop");
    await repos.createSellerListing({
      sellerId: seller.id,
      title: "H&M Navy Oxford",
      category: "tops",
      tags: ["h&m", "shirt"],
      coinPrice: 899,
      realPrice: "₹899",
      productImageKeys: ["img"],
      houseModelRenderKey: "hm",
      affiliateUrl: "https://example.com/hm",
      variant: { size: "M", color: "navy", garmentImageKey: "g1" },
    });

    const create = await app.inject({
      method: "POST",
      url: "/price-watches",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { brand: "H&M", watchedPriceMinor: 150_000, thresholdPct: 10 },
    });
    expect(create.statusCode).toBe(201);
    const watch = create.json() as BrandPriceWatch;
    expect(watch.brand).toBe("H&M");
    expect(watch.thresholdPct).toBe(10);

    const list = await app.inject({
      method: "GET",
      url: "/price-watches",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as BrandPriceWatchListResponse).watches).toHaveLength(1);

    const scan = await app.inject({
      method: "POST",
      url: "/price-watches/scan",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(scan.statusCode).toBe(200);
    const body = scan.json() as PriceDropScanResponse;
    expect(body.scannedListings).toBeGreaterThanOrEqual(1);
    expect(body.hits.length).toBeGreaterThanOrEqual(1);
    expect(body.hits[0]!.brand).toBe("H&M");
    // ₹899 = 89900 minor vs watched 150000 → drop > 10%
    expect(body.hits[0]!.currentPriceMinor).toBe(89_900);

    await app.close();
  });

  it("evaluateWatchAgainstListings respects threshold", () => {
    const hits = evaluateWatchAgainstListings(
      {
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        userId: "u1",
        brand: "Zara",
        watchedPriceMinor: 10_000,
        thresholdPct: 20,
        lastSeenPriceMinor: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [
        {
          id: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          title: "Zara Blazer",
          tags: ["zara"],
          realPrice: "₹95",
          status: "ACTIVE",
        },
        {
          id: "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          title: "Zara Coat",
          tags: ["zara"],
          realPrice: "₹70",
          status: "ACTIVE",
        },
      ],
    );
    // 9500 is 5% drop — no; 7000 is 30% — yes
    expect(hits).toHaveLength(1);
    expect(hits[0]!.listingTitle).toBe("Zara Coat");
  });
});
