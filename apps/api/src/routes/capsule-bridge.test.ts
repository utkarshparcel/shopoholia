import { describe, expect, it } from "vitest";
import type { CapsuleResponse, CompleteLookResponse, ReplaceTwinsResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("N32 capsule", () => {
  it("PUT/GET capsule membership and outfit prefers capsule", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const a = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "capsule tee", colors: ["black"], imageKeys: [`u/${userId}/wardrobe/a.jpg`] },
    });
    const b = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "capsule jeans", colors: ["blue"], imageKeys: [`u/${userId}/wardrobe/b.jpg`] },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "outside hoodie", colors: ["red"], imageKeys: [`u/${userId}/wardrobe/c.jpg`] },
    });
    const idA = (a.json() as { id: string }).id;
    const idB = (b.json() as { id: string }).id;

    const put = await app.inject({
      method: "PUT",
      url: "/wardrobe/capsule",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { itemIds: [idA, idB] },
    });
    expect(put.statusCode).toBe(200);
    const capsule = put.json() as CapsuleResponse;
    expect(capsule.itemIds.sort()).toEqual([idA, idB].sort());
    expect(capsule.items?.length).toBe(2);

    const get = await app.inject({
      method: "GET",
      url: "/wardrobe/capsule",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(get.statusCode).toBe(200);
    expect((get.json() as CapsuleResponse).itemIds.sort()).toEqual([idA, idB].sort());

    const today = await app.inject({
      method: "GET",
      url: "/outfits/today",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(today.statusCode).toBe(200);
    const outfit = (today.json() as { outfit: { itemIds: string[]; whyThis?: string[] } }).outfit;
    expect(outfit).not.toBeNull();
    for (const id of outfit!.itemIds) {
      expect([idA, idB]).toContain(id);
    }
    expect(outfit!.whyThis?.some((s) => /capsule/i.test(s))).toBe(true);
  });
});

describe("N51 replace twin", () => {
  it("returns affiliate candidates and records cashback click", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "blue jeans", colors: ["blue"], brand: "Levis" },
    });
    const itemId = (created.json() as { id: string }).id;

    const seller = await app.deps.repos.registerSeller(userId, "Twin Shop");
    const { listing } = await app.deps.repos.createSellerListing({
      sellerId: seller.id,
      title: "Levis Blue Slim Jeans",
      category: "jeans",
      tags: ["blue"],
      coinPrice: 200,
      productImageKeys: ["j.jpg"],
      houseModelRenderKey: "h.jpg",
      affiliateUrl: "https://aff.example/jeans-twin",
      variant: { size: "M", color: "Blue", garmentImageKey: "g.jpg" },
    });

    const twins = await app.inject({
      method: "GET",
      url: `/waste/${itemId}/replace-twins`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(twins.statusCode).toBe(200);
    const body = twins.json() as ReplaceTwinsResponse;
    expect(body.wardrobeItemId).toBe(itemId);
    expect(body.candidates.some((c) => c.listingId === listing.id)).toBe(true);
    expect(body.candidates[0]!.matchQuery.tokens.length).toBeGreaterThan(0);
    expect(body.candidates[0]!.affiliateUrl).toBeTruthy();

    const click = await app.inject({
      method: "POST",
      url: `/waste/${itemId}/replace-twins/click`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { listingId: listing.id, platform: "myntra", clickId: "click-twin-1" },
    });
    expect(click.statusCode).toBe(200);
    expect(click.json()).toMatchObject({
      recorded: true,
      clickId: "click-twin-1",
      listingId: listing.id,
      wardrobeItemId: itemId,
    });

    const events = await app.deps.repos.listCashbackEvents(userId);
    expect(events.some((e) => e.clickId === "click-twin-1" && e.listingId === listing.id)).toBe(
      true,
    );
  });
});

describe("N52 complete look", () => {
  it("builds owned + missing affiliate slots", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const shirt = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "white shirt", colors: ["white"] },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "navy blazer", colors: ["navy"] },
    });

    const seller = await app.deps.repos.registerSeller(userId, "Look Shop");
    await app.deps.repos.createSellerListing({
      sellerId: seller.id,
      title: "Navy Trousers",
      category: "trousers",
      tags: ["navy"],
      coinPrice: 150,
      productImageKeys: ["t.jpg"],
      houseModelRenderKey: "h.jpg",
      affiliateUrl: "https://aff.example/trousers",
      variant: { size: "M", color: "Navy", garmentImageKey: "g.jpg" },
    });
    await app.deps.repos.createSellerListing({
      sellerId: seller.id,
      title: "White Sneakers",
      category: "sneakers",
      tags: ["white"],
      coinPrice: 120,
      productImageKeys: ["s.jpg"],
      houseModelRenderKey: "h.jpg",
      affiliateUrl: "https://aff.example/sneakers",
      variant: { size: "9", color: "White", garmentImageKey: "g2.jpg" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/outfits/complete-look",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const look = res.json() as CompleteLookResponse;
    expect(look.owned.length).toBeGreaterThan(0);
    expect(look.gaps.map((g) => g.slot).sort()).toEqual(["bottom", "shoes"]);
    expect(look.missing.some((m) => m.slot === "bottom" && m.affiliateUrl)).toBe(true);
    expect(look.missing.some((m) => m.slot === "shoes" && m.affiliateUrl)).toBe(true);
    expect(look.summary.length).toBeGreaterThan(0);

    const shirtId = (shirt.json() as { id: string }).id;
    const scoped = await app.inject({
      method: "GET",
      url: `/outfits/complete-look?itemIds=${shirtId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(scoped.statusCode).toBe(200);
    const scopedLook = scoped.json() as CompleteLookResponse;
    expect(scopedLook.owned.some((o) => o.item.id === shirtId)).toBe(true);
  });
});
