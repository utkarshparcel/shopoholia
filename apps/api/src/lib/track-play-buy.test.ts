import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./repositories/memory.js";
import { trackPlayBuyInCloset, TrackPlayBuyError, PLAY_MERCHANT } from "./track-play-buy.js";

describe("trackPlayBuyInCloset", () => {
  it("creates merchant_purchases from a Play order id", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919811122233");
    const listingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const variantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await repos.seedListings(
      [
        {
          id: listingId,
          sellerId: null,
          title: "Linen Blazer",
          category: "APPAREL",
          tags: [],
          coinPrice: 120,
          realPrice: "₹2,499",
          productImageKeys: ["img/blazer.jpg"],
          houseModelRenderKey: "house/blazer.jpg",
          affiliateUrl: null,
          affiliateLinks: null,
          status: "ACTIVE",
          sortOrder: 0,
          createdAt: new Date(),
        },
      ],
      [
        {
          id: variantId,
          listingId,
          size: "M",
          color: "Navy",
          garmentImageKey: "garment/blazer.jpg",
        },
      ],
    );

    const { order } = await repos.createOrder({
      userId: user.id,
      tier: "EXPRESS",
      coinTotal: 120,
      stateEta: {},
      idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      items: [{ listingVariantId: variantId, coinPriceSnapshot: 120, quantity: 1 }],
    });

    const result = await trackPlayBuyInCloset(repos, {
      userId: user.id,
      orderId: order.id,
      seedWardrobe: true,
    });

    expect(result.created).toBe(true);
    expect(result.itemCount).toBe(1);
    expect(result.wardrobeItemIds).toHaveLength(1);

    const purchase = await repos.findMerchantPurchaseById(result.purchaseId);
    expect(purchase?.merchant).toBe(PLAY_MERCHANT);
    expect(purchase?.orderRef).toBe(order.id);
    expect(purchase?.source).toBe("MANUAL");
    expect(purchase?.totalMinor).toBe(249900);

    const items = await repos.listMerchantPurchaseItems(result.purchaseId);
    expect(items[0]!.title).toBe("Linen Blazer");
    expect(items[0]!.category).toBe("APPAREL");

    const wardrobe = await repos.listWardrobeItems(user.id);
    expect(wardrobe).toHaveLength(1);
    expect(wardrobe[0]!.purchaseItemId).toBe(items[0]!.id);
  });

  it("is idempotent on the same order id", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919811122244");
    const listingId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const variantId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await repos.seedListings(
      [
        {
          id: listingId,
          sellerId: null,
          title: "Tote",
          category: "ACCESSORIES",
          tags: [],
          coinPrice: 50,
          realPrice: null,
          productImageKeys: [],
          houseModelRenderKey: "house/tote.jpg",
          affiliateUrl: null,
          affiliateLinks: null,
          status: "ACTIVE",
          sortOrder: 0,
          createdAt: new Date(),
        },
      ],
      [
        {
          id: variantId,
          listingId,
          size: "OS",
          color: "Tan",
          garmentImageKey: "garment/tote.jpg",
        },
      ],
    );
    const { order } = await repos.createOrder({
      userId: user.id,
      tier: "STANDARD",
      coinTotal: 50,
      stateEta: {},
      idempotencyKey: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      items: [{ listingVariantId: variantId, coinPriceSnapshot: 50, quantity: 1 }],
    });

    const first = await trackPlayBuyInCloset(repos, {
      userId: user.id,
      orderId: order.id,
      seedWardrobe: false,
    });
    const second = await trackPlayBuyInCloset(repos, {
      userId: user.id,
      orderId: order.id,
      seedWardrobe: false,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.purchaseId).toBe(first.purchaseId);
    const purchases = await repos.listMerchantPurchases(user.id);
    expect(purchases).toHaveLength(1);
  });

  it("rejects unknown orders", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919811122255");
    await expect(
      trackPlayBuyInCloset(repos, {
        userId: user.id,
        orderId: "99999999-9999-4999-8999-999999999999",
      }),
    ).rejects.toBeInstanceOf(TrackPlayBuyError);
  });
});
