import type { ListingRecord, ListingVariantRecord, Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function resolveImageUrl(
  key: string,
  storage: StorageClient,
): Promise<string> {
  if (isHttpUrl(key)) {
    return key;
  }
  return storage.getSignedUrl(key);
}

async function loadSellers(sellerIds: string[], repos: Repositories): Promise<Map<string, { id: string; shopName: string }>> {
  if (sellerIds.length === 0) return new Map();
  const sellers = await repos.findSellersByIds(sellerIds);
  const sellerMap = new Map<string, { id: string; shopName: string }>();
  for (const seller of sellers) {
    sellerMap.set(seller.id, seller);
  }
  return sellerMap;
}

async function sellerNameForListing(
  listing: ListingRecord,
  sellerMap: Map<string, { id: string; shopName: string }>,
): Promise<string | null> {
  if (!listing.sellerId) return null;
  const seller = sellerMap.get(listing.sellerId);
  return seller?.shopName ?? null;
}

export async function listingCardDto(
  listing: ListingRecord,
  storage: StorageClient,
  repos: Repositories,
  sellerMap?: Map<string, { id: string; shopName: string }>,
) {
  const sellerMapToUse = sellerMap ?? (await loadSellers(
    listing.sellerId ? [listing.sellerId] : [],
    repos
  ));

  return {
    id: listing.id,
    title: listing.title,
    category: listing.category,
    coinPrice: listing.coinPrice,
    realPrice: listing.realPrice ?? null,
    houseModelImageUrl: await resolveImageUrl(listing.houseModelRenderKey, storage),
    sellerId: listing.sellerId,
    sellerName: await sellerNameForListing(listing, sellerMapToUse),
    affiliateUrl: listing.affiliateUrl,
    affiliateLinks: listing.affiliateLinks ?? null,
  };
}

export async function listingDetailDto(
  listing: ListingRecord,
  variants: ListingVariantRecord[],
  storage: StorageClient,
  repos: Repositories,
) {
  const sellerMap = await loadSellers(
    listing.sellerId ? [listing.sellerId] : [],
    repos
  );

  const card = await listingCardDto(listing, storage, repos, sellerMap);
  const variantDtos = await Promise.all(
    variants.map(async (variant) => ({
      id: variant.id,
      size: variant.size,
      color: variant.color,
      garmentImageUrl: await resolveImageUrl(variant.garmentImageKey, storage),
    })),
  );

  return {
    ...card,
    tags: listing.tags,
    variants: variantDtos,
  };
}
