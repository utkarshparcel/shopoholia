import { describe, it, expect } from "vitest";
import type { DispositionListResponse, DispositionListing, WardrobeItem } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("disposition marketplace real rails", () => {
  it("SELL creates seller+listing+variant and links sellerId", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", colors: ["blue"], brand: "Zara", costMinor: 199900, imageKeys: [`u/${userId}/wardrobe/a.jpg`], garmentImageKey: `u/${userId}/wardrobe/a.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    const create = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: itemId, mode: "SELL", priceMinor: 5000 },
    });
    expect(create.statusCode).toBe(201);
    const body = create.json() as DispositionListing;
    expect(body.sellerId).toBeTruthy();
    const sellers = await repos.listSellersByUser(userId);
    expect(sellers.length).toBe(1);
    expect(sellers[0]!.id).toBe(body.sellerId);
    // sellerType INDIVIDUAL
    expect(sellers[0]!.sellerType).toBe("INDIVIDUAL");
    const listings = await repos.listListingsByUser(userId);
    expect(listings.length).toBe(1);
    expect(listings[0]!.sellerId).toBe(body.sellerId);
    const variants = await repos.listListingVariantsByUser(userId);
    expect(variants.length).toBe(1);
    expect(variants[0]!.listingId).toBe(listings[0]!.id);
    // waste dispose also creates marketplace for SELL
    const item2 = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "jeans", imageKeys: [`u/${userId}/wardrobe/j.jpg`], garmentImageKey: `u/${userId}/wardrobe/j.jpg` },
    });
    const itemId2 = (item2.json() as WardrobeItem).id;
    const dispose = await app.inject({
      method: "POST",
      url: `/waste/${itemId2}/dispose`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mode: "SELL", priceMinor: 3000 },
    });
    expect(dispose.statusCode).toBe(200);
    const listings2 = await repos.listListingsByUser(userId);
    expect(listings2.length).toBe(2);
    await app.close();
  });

  it("DONATE skips marketplace; BARTER creates seller+listing rails", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "dress", imageKeys: [`u/${userId}/wardrobe/d.jpg`], garmentImageKey: `u/${userId}/wardrobe/d.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    const donate = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: itemId, mode: "DONATE" },
    });
    expect(donate.statusCode).toBe(201);
    const donateBody = donate.json() as DispositionListing;
    expect(donateBody.sellerId).toBeNull();
    expect(donateBody.status).toBe("ACTIVE");
    expect((await repos.listListingsByUser(userId)).length).toBe(0);
    const item2 = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "kurta", imageKeys: [`u/${userId}/wardrobe/k.jpg`], garmentImageKey: `u/${userId}/wardrobe/k.jpg` },
    });
    const itemId2 = (item2.json() as WardrobeItem).id;
    const barter = await app.inject({
      method: "POST",
      url: `/waste/${itemId2}/dispose`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mode: "BARTER" },
    });
    expect(barter.statusCode).toBe(200);
    expect((await repos.listListingsByUser(userId)).length).toBe(1);
    const barterListing = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "coat", imageKeys: [`u/${userId}/wardrobe/c.jpg`], garmentImageKey: `u/${userId}/wardrobe/c.jpg` },
    });
    const itemId3 = (barterListing.json() as WardrobeItem).id;
    const barterDisp = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: itemId3, mode: "BARTER", createSeller: true },
    });
    expect(barterDisp.statusCode).toBe(201);
    const b = barterDisp.json() as DispositionListing;
    expect(b.sellerId).toBeTruthy();
    expect(b.status).toBe("ACTIVE");
    expect((await repos.listListingsByUser(userId)).length).toBe(2);
    expect((await repos.listSellersByUser(userId)).some((s) => s.id === b.sellerId)).toBe(true);
    await app.close();
  });

  it("waste dispose DONATE linking via disposition listings", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "saree", imageKeys: [`u/${userId}/wardrobe/s.jpg`], garmentImageKey: `u/${userId}/wardrobe/s.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    await app.inject({
      method: "POST",
      url: `/waste/${itemId}/dispose`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mode: "DONATE" },
    });
    const list = await app.inject({ method: "GET", url: "/disposition", headers: { authorization: `Bearer ${accessToken}` } });
    expect(
      (list.json() as DispositionListResponse).listings.some(
        (l) => l.wardrobeItemId === itemId && l.mode === "DONATE",
      ),
    ).toBe(true);
    await app.close();
  });
});
