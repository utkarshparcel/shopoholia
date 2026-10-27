import type { Repositories, WardrobeItemRecord } from "./repositories/types.js";

export type DispositionMode = "SELL" | "DONATE" | "BARTER";

export async function ensureIndividualSeller(
  repos: Repositories,
  userId: string,
): Promise<{ id: string; userId: string; shopName: string }> {
  const existing = await repos.findSellerByUserId(userId);
  if (existing) return existing;
  const shopName = `Closet ${userId.slice(0, 8)}`;
  const seller = await repos.registerSeller(userId, shopName, "INDIVIDUAL");
  return seller;
}

export async function createMarketplaceListingForDisposition(
  repos: Repositories,
  sellerId: string,
  wardrobeItem: WardrobeItemRecord,
  priceMinor: number | null | undefined,
) {
  const titleBase = wardrobeItem.brand
    ? `${wardrobeItem.category} — ${wardrobeItem.brand}`
    : wardrobeItem.category;
  const title = titleBase.slice(0, 80) || wardrobeItem.category;
  const rawPrice = priceMinor ?? wardrobeItem.costMinor ?? 0;
  const coinPrice = rawPrice > 0 ? Math.max(1, Math.round(rawPrice / 100)) : 100;
  const productImageKeys =
    wardrobeItem.imageKeys && wardrobeItem.imageKeys.length > 0
      ? wardrobeItem.imageKeys
      : wardrobeItem.garmentImageKey
        ? [wardrobeItem.garmentImageKey]
        : ["placeholder.jpg"];
  const houseModelRenderKey = wardrobeItem.garmentImageKey ?? productImageKeys[0] ?? "placeholder.jpg";
  const garmentImageKey = wardrobeItem.garmentImageKey ?? productImageKeys[0] ?? "placeholder.jpg";
  const color = wardrobeItem.colors?.[0] ?? "Default";

  const result = await repos.createSellerListing({
    sellerId,
    title,
    category: wardrobeItem.category,
    tags: wardrobeItem.colors ?? [],
    coinPrice,
    realPrice: priceMinor != null ? `₹${(priceMinor / 100).toFixed(2)}` : null,
    productImageKeys,
    houseModelRenderKey,
    affiliateUrl: null,
    variant: { size: "M", color, garmentImageKey },
  });
  return result;
}

export type DispositionRailsResult = {
  sellerId: string | null;
  listingId: string | null;
};

/**
 * Mode rails (DISP-MARKET-RAILS):
 * - SELL / BARTER → ensure INDIVIDUAL seller + marketplace listing/variant; sellerId FK set
 * - DONATE → disposition row only; no seller / no marketplace listing
 * - `createSeller` on DONATE is ignored; on BARTER/SELL seller is always created
 */
export async function prepareDispositionRails(
  repos: Repositories,
  userId: string,
  wardrobeItem: WardrobeItemRecord,
  mode: DispositionMode,
  priceMinor: number | null | undefined,
  _opts?: { createSeller?: boolean },
): Promise<DispositionRailsResult> {
  if (mode === "SELL" || mode === "BARTER") {
    const seller = await ensureIndividualSeller(repos, userId);
    const { listing } = await createMarketplaceListingForDisposition(
      repos,
      seller.id,
      wardrobeItem,
      priceMinor,
    );
    return { sellerId: seller.id, listingId: listing.id };
  }
  return { sellerId: null, listingId: null };
}
