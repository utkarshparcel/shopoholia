import { describe, it, expect } from "vitest";
import type {
  DispositionListResponse,
  DispositionListing,
  DisposeResponse,
  WardrobeItem,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("disposition", () => {
  it("creates and lists disposition listings", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", costMinor: 10000, imageKeys: [`u/${userId}/wardrobe/a.jpg`], garmentImageKey: `u/${userId}/wardrobe/a.jpg` },
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
    expect(body.mode).toBe("SELL");
    expect(body.status).toBe("ACTIVE");
    expect(body.sellerId).toBeTruthy();
    const list = await app.inject({ method: "GET", url: "/disposition", headers: { authorization: `Bearer ${accessToken}` } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as DispositionListResponse).listings.length).toBe(1);
    await app.close();
  });

  it("DONATE creates ACTIVE disposition listing without seller", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "dress", imageKeys: [`u/${userId}/wardrobe/d.jpg`], garmentImageKey: `u/${userId}/wardrobe/d.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    const create = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: itemId, mode: "DONATE" },
    });
    expect(create.statusCode).toBe(201);
    const body = create.json() as DispositionListing;
    expect(body.mode).toBe("DONATE");
    expect(body.status).toBe("ACTIVE");
    expect(body.sellerId).toBeNull();
    await app.close();
  });

  it("BARTER with createSeller populates sellerId and marketplace listing", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "kurta", imageKeys: [`u/${userId}/wardrobe/k.jpg`], garmentImageKey: `u/${userId}/wardrobe/k.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    const create = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: itemId, mode: "BARTER", createSeller: true },
    });
    expect(create.statusCode).toBe(201);
    const body = create.json() as DispositionListing;
    expect(body.mode).toBe("BARTER");
    expect(body.status).toBe("ACTIVE");
    expect(body.sellerId).toBeTruthy();
    // BARTER uses the same marketplace rails as SELL (seller + listing/variant).
    expect((await repos.listListingsByUser(userId)).length).toBe(1);
    await app.close();
  });

  it("one ACTIVE listing per item: a double tap reuses it, another mode is 409, another user's item is 404", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const other = await login(app, "919876500012");
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "saree", costMinor: 20000, imageKeys: [`u/${userId}/wardrobe/s.jpg`], garmentImageKey: `u/${userId}/wardrobe/s.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    const sell = () =>
      app.inject({
        method: "POST",
        url: "/disposition",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: itemId, mode: "SELL", priceMinor: 9000 },
      });
    const [a, b] = await Promise.all([sell(), sell()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect((a.json() as DispositionListing).id).toBe((b.json() as DispositionListing).id);
    expect((await repos.listDispositionListings(userId)).filter((l) => l.status === "ACTIVE").length).toBe(1);
    expect((await repos.listListingsByUser(userId)).length).toBe(1);

    const donate = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: itemId, mode: "DONATE" },
    });
    expect(donate.statusCode).toBe(409);

    const foreign = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { wardrobeItemId: itemId, mode: "SELL" },
    });
    expect(foreign.statusCode).toBe(404);
    await app.close();
  });

  it("waste dispose creates disposition listing (real)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "dress", imageKeys: [`u/${userId}/wardrobe/d.jpg`], garmentImageKey: `u/${userId}/wardrobe/d.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    const dispose = await app.inject({
      method: "POST",
      url: `/waste/${itemId}/dispose`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mode: "DONATE" },
    });
    expect(dispose.statusCode).toBe(200);
    const d = dispose.json() as DisposeResponse;
    expect(d.mode).toBe("DONATE");
    const list = await app.inject({ method: "GET", url: "/disposition", headers: { authorization: `Bearer ${accessToken}` } });
    expect(
      (list.json() as DispositionListResponse).listings.some((l) => l.wardrobeItemId === itemId),
    ).toBe(true);
    await app.close();
  });

  it("declutter challenge tracks disposed progress + share card", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const start = await app.inject({
      method: "POST",
      url: "/disposition/challenge",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { target: 3 },
    });
    expect(start.statusCode).toBe(200);
    const started = start.json() as {
      declutterChallenge: { progress: number; target: number; started: boolean; completed: boolean; label: string };
      declutterShareCard: { headline: string; shareText: string; watermark: string };
      pushQueued: boolean;
    };
    expect(started.declutterChallenge).toMatchObject({
      progress: 0,
      target: 3,
      started: true,
      completed: false,
    });
    expect(started.declutterShareCard.watermark).toBe("worn.app");
    expect(started.declutterShareCard.shareText).toContain("worn.app");
    expect(started.pushQueued).toBe(true);

    const events = await app.deps.push.listEvents(userId);
    expect(events.some((e) => e.eventType === "DECLUTTER_CHALLENGE")).toBe(true);

    for (let i = 0; i < 3; i++) {
      const item = await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          category: `tee-${i}`,
          imageKeys: [`u/${userId}/wardrobe/t${i}.jpg`],
          garmentImageKey: `u/${userId}/wardrobe/t${i}.jpg`,
        },
      });
      const itemId = (item.json() as WardrobeItem).id;
      const dispose = await app.inject({
        method: "POST",
        url: `/waste/${itemId}/dispose`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mode: i % 2 === 0 ? "SELL" : "DONATE" },
      });
      expect(dispose.statusCode).toBe(200);
    }

    const list = await app.inject({
      method: "GET",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as DispositionListResponse;
    expect(body.listings.length).toBe(3);
    expect(body.declutterChallenge).toMatchObject({
      progress: 3,
      target: 3,
      completed: true,
      started: true,
    });
    expect(body.declutterShareCard?.completed).toBe(true);
    expect(body.declutterShareCard?.shareText).toContain("worn.app");

    const waste = await app.inject({
      method: "GET",
      url: "/waste/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(waste.statusCode).toBe(200);
    const wasteBody = waste.json() as {
      declutterChallenge?: { progress: number; completed: boolean };
      declutterShareCard?: { watermark: string };
    };
    expect(wasteBody.declutterChallenge?.completed).toBe(true);
    expect(wasteBody.declutterShareCard?.watermark).toBe("worn.app");

    const again = await app.inject({
      method: "POST",
      url: "/disposition/challenge",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(again.statusCode).toBe(409);

    await app.close();
  });

  it("suggests price and books logistics pickup stub", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        category: "blazer",
        brand: "Raymond",
        costMinor: 800000,
        imageKeys: [`u/${userId}/wardrobe/b.jpg`],
        garmentImageKey: `u/${userId}/wardrobe/b.jpg`,
      },
    });
    const itemId = (item.json() as WardrobeItem).id;

    const partners = await app.inject({
      method: "GET",
      url: "/disposition/partners?mode=SELL",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(partners.statusCode).toBe(200);
    const partnerList = partners.json() as { partners: Array<{ id: string; stub: true }> };
    expect(partnerList.partners.length).toBeGreaterThan(0);
    expect(partnerList.partners.every((p) => p.stub)).toBe(true);

    const suggest = await app.inject({
      method: "GET",
      url: `/disposition/suggest-price?wardrobeItemId=${itemId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(suggest.statusCode).toBe(200);
    const price = suggest.json() as {
      wardrobeItemId: string;
      suggestedPriceMinor: number;
      floorMinor: number;
      ceilingMinor: number;
      rationale: string;
    };
    expect(price.wardrobeItemId).toBe(itemId);
    expect(price.suggestedPriceMinor).toBeGreaterThan(0);
    expect(price.suggestedPriceMinor).toBeGreaterThanOrEqual(price.floorMinor);
    expect(price.suggestedPriceMinor).toBeLessThanOrEqual(price.ceilingMinor);
    expect(price.rationale.length).toBeGreaterThan(10);

    const create = await app.inject({
      method: "POST",
      url: "/disposition",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        wardrobeItemId: itemId,
        mode: "SELL",
        priceMinor: price.suggestedPriceMinor,
      },
    });
    expect(create.statusCode).toBe(201);
    const listing = create.json() as DispositionListing;

    const slot = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const book = await app.inject({
      method: "POST",
      url: `/disposition/${listing.id}/pickup`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        partnerId: partnerList.partners[0]!.id,
        pickupSlotAt: slot,
      },
    });
    expect(book.statusCode).toBe(200);
    const booking = book.json() as {
      dispositionId: string;
      partnerId: string;
      stub: true;
      pickupSlotAt: string;
    };
    expect(booking.dispositionId).toBe(listing.id);
    expect(booking.stub).toBe(true);
    expect(booking.partnerId).toBe(partnerList.partners[0]!.id);

    const get = await app.inject({
      method: "GET",
      url: `/disposition/${listing.id}/pickup`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(get.statusCode).toBe(200);
    expect((get.json() as { partnerId: string }).partnerId).toBe(booking.partnerId);

    const badPartner = await app.inject({
      method: "POST",
      url: `/disposition/${listing.id}/pickup`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { partnerId: "stub-goonj-donate", pickupSlotAt: slot },
    });
    expect(badPartner.statusCode).toBe(400);

    await app.close();
  });
});
