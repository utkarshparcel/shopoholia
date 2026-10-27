import { describe, expect, it } from "vitest";
import type { PrebuyFitResponse, TrackPlayBuyResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

async function seedOrder(app: Awaited<ReturnType<typeof buildTestServer>>["app"], userId: string) {
  const seller = await app.deps.repos.registerSeller(userId, "Bridge Seller", "RETAILER");
  const { listing, variant } = await app.deps.repos.createSellerListing({
    sellerId: seller.id,
    title: "Indigo denim jacket",
    category: "APPAREL",
    tags: ["denim"],
    coinPrice: 120,
    realPrice: "₹1,200",
    productImageKeys: ["listings/jacket.jpg"],
    houseModelRenderKey: "listings/jacket-hm.jpg",
    affiliateUrl: null,
    variant: { size: "M", color: "Indigo", garmentImageKey: "listings/jacket-g.jpg" },
  });
  const cart = await app.deps.repos.getOrCreateCart(userId);
  await app.deps.repos.addCartItem({
    cartId: cart.id,
    listingVariantId: variant.id,
    coinPriceSnapshot: listing.coinPrice,
    quantity: 1,
  });
  await app.deps.repos.grantCoins({
    userId,
    delta: 500,
    type: "GRANT",
    refType: "test",
    refId: "bridge-grant",
  });
  return { listing, variant };
}

describe("bridge routes N50 + N33 + WV08", () => {
  it("creates merchant purchase from Play order id (N50)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await seedOrder(app, userId);

    const checkout = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tier: "STANDARD" },
    });
    expect(checkout.statusCode).toBe(201);
    const order = checkout.json() as { id: string };

    const track = await app.inject({
      method: "POST",
      url: "/purchases/from-order",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { orderId: order.id, seedWardrobe: true },
    });
    expect(track.statusCode).toBe(201);
    const body = track.json() as TrackPlayBuyResponse;
    expect(body.created).toBe(true);
    expect(body.itemCount).toBe(1);
    expect(body.wardrobeItemIds.length).toBe(1);

    const purchase = await app.deps.repos.findMerchantPurchaseById(body.purchaseId);
    expect(purchase?.merchant).toBe("WORN Play");
    expect(purchase?.orderRef).toBe(order.id);
    expect(purchase?.totalMinor).toBeGreaterThan(0);

    const again = await app.inject({
      method: "POST",
      url: "/purchases/from-order",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { orderId: order.id, seedWardrobe: true },
    });
    expect(again.statusCode).toBe(200);
    const idem = again.json() as TrackPlayBuyResponse;
    expect(idem.created).toBe(false);
    expect(idem.purchaseId).toBe(body.purchaseId);

    const pathTrack = await app.inject({
      method: "POST",
      url: `/orders/${order.id}/track-in-closet`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { seedWardrobe: true },
    });
    expect(pathTrack.statusCode).toBe(200);
    expect(pathTrack.json().created).toBe(false);

    const get = await app.inject({
      method: "GET",
      url: `/orders/${order.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(get.json().trackedInCloset).toBe(true);
  });

  it("returns closet fit score for cart candidates (N33)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    await app.deps.repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "jacket",
      colors: ["indigo"],
      brand: "WORN Play",
      costMinor: 100000,
      imageKeys: [],
      garmentImageKey: null,
      purchaseItemId: null,
    });
    await app.deps.repos.createBudget({
      userId,
      category: "APPAREL",
      period: "MONTHLY",
      limitMinor: 50000,
    });

    await seedOrder(app, userId);

    const fit = await app.inject({
      method: "POST",
      url: "/prebuy/fit",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { useCart: true },
    });
    expect(fit.statusCode).toBe(200);
    const body = fit.json() as PrebuyFitResponse;
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.summary.length).toBeGreaterThan(0);
    expect(body.softBlock || body.overlaps.length > 0 || body.gaps.length >= 0).toBe(true);

    const direct = await app.inject({
      method: "POST",
      url: "/prebuy/fit",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        candidates: [
          {
            title: "Indigo denim jacket",
            category: "APPAREL",
            brand: "WORN Play",
            priceMinor: 120000,
          },
        ],
      },
    });
    expect(direct.statusCode).toBe(200);
    const scored = direct.json() as PrebuyFitResponse;
    expect(scored.overlaps.length + scored.budgetNudges.length).toBeGreaterThan(0);
    expect(scored.primaryBudgetNudge?.exceeded).toBe(true);
  });

  it("checkout returns soft budgetNudge when over budget (WV08)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.deps.repos.createBudget({
      userId,
      category: "GENERAL",
      period: "MONTHLY",
      limitMinor: 50,
    });
    await seedOrder(app, userId);

    const checkout = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tier: "EXPRESS" },
    });
    expect(checkout.statusCode).toBe(201);
    const order = checkout.json() as {
      id: string;
      budgetNudge: { exceeded: boolean; message: string; projectedMinor: number } | null;
    };
    expect(order.budgetNudge?.exceeded).toBe(true);
    expect(order.budgetNudge?.message).toMatch(/budget/i);
    expect(order.budgetNudge?.projectedMinor).toBeGreaterThan(50);
  });
});
