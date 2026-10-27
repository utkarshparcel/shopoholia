import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./repositories/memory.js";
import {
  createMarketplaceListingForDisposition,
  ensureIndividualSeller,
  prepareDispositionRails,
} from "./disposition-marketplace.js";

describe("disposition-marketplace (DISP-MARKET-RAILS)", () => {
  it("ensureIndividualSeller registers INDIVIDUAL seller once", async () => {
    const repos = createMemoryRepositories();
    const userId = "00000000-0000-4000-8000-000000000001";
    const a = await ensureIndividualSeller(repos, userId);
    const b = await ensureIndividualSeller(repos, userId);
    expect(a.id).toBe(b.id);
    expect(a.shopName).toMatch(/^Closet /);
    const sellers = await repos.listSellersByUser(userId);
    expect(sellers).toHaveLength(1);
    expect(sellers[0]!.sellerType).toBe("INDIVIDUAL");
  });

  it("SELL/BARTER create seller+listing; DONATE does not", async () => {
    const repos = createMemoryRepositories();
    const userId = "00000000-0000-4000-8000-000000000002";
    const item = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "shirt",
      colors: ["navy"],
      brand: "Uniqlo",
      costMinor: 250000,
      imageKeys: ["s.jpg"],
      garmentImageKey: "s.jpg",
    });

    const sell = await prepareDispositionRails(repos, userId, item, "SELL", 5000);
    expect(sell.sellerId).toBeTruthy();
    expect(sell.listingId).toBeTruthy();

    const item2 = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "kurta",
      colors: ["cream"],
      brand: null,
      costMinor: 100000,
      imageKeys: ["k.jpg"],
      garmentImageKey: "k.jpg",
    });
    const barter = await prepareDispositionRails(repos, userId, item2, "BARTER", null);
    expect(barter.sellerId).toBe(sell.sellerId);
    expect(barter.listingId).toBeTruthy();
    expect(barter.listingId).not.toBe(sell.listingId);

    const item3 = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "dress",
      colors: ["red"],
      brand: null,
      costMinor: 0,
      imageKeys: ["d.jpg"],
      garmentImageKey: "d.jpg",
    });
    const donate = await prepareDispositionRails(repos, userId, item3, "DONATE", null);
    expect(donate).toEqual({ sellerId: null, listingId: null });

    const listings = await repos.listListingsByUser(userId);
    expect(listings).toHaveLength(2);
    expect(listings.every((l) => l.sellerId === sell.sellerId)).toBe(true);
  });

  it("createMarketplaceListingForDisposition links sellerId FK", async () => {
    const repos = createMemoryRepositories();
    const userId = "00000000-0000-4000-8000-000000000003";
    const seller = await ensureIndividualSeller(repos, userId);
    const item = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "jeans",
      colors: ["blue"],
      brand: "Levi's",
      costMinor: 400000,
      imageKeys: [],
      garmentImageKey: null,
    });
    const { listing, variant } = await createMarketplaceListingForDisposition(
      repos,
      seller.id,
      item,
      9900,
    );
    expect(listing.sellerId).toBe(seller.id);
    expect(variant.listingId).toBe(listing.id);
    expect(listing.coinPrice).toBeGreaterThan(0);
  });
});
