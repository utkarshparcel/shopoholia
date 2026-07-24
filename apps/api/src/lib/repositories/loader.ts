import type { ListingRecord, ListingVariantRecord, Repositories } from "./types.js";

export async function loadDataForCart(
  repos: Repositories,
  variantIds: string[],
): Promise<{
  variantMap: Map<string, ListingVariantRecord>;
  listingMap: Map<string, ListingRecord>;
  sellerMap: Map<string, { id: string; shopName: string }>;
}> {
  const variantMap = new Map<string, ListingVariantRecord>();
  const listingMap = new Map<string, ListingRecord>();
  const sellerMap = new Map<string, { id: string; shopName: string }>();

  if (variantIds.length === 0) return { variantMap, listingMap, sellerMap };

  const variants = await repos.findVariantsByIds(variantIds);
  const listingIds = Array.from(new Set(variants.map((v) => v.listingId)));
  const listings = await repos.findListingsByIds(listingIds);
  const sellerIds = Array.from(new Set(listings.map((l) => l.sellerId).filter(Boolean))) as string[];
  const sellers = await repos.findSellersByIds(sellerIds);

  for (const variant of variants) {
    variantMap.set(variant.id, variant);
  }
  for (const listing of listings) {
    listingMap.set(listing.id, listing);
  }
  for (const seller of sellers) {
    sellerMap.set(seller.id, seller);
  }

  return { variantMap, listingMap, sellerMap };
}
