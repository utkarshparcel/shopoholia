import type { ListingRecord, ListingVariantRecord, Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";

async function sellerNameForListing(
  listing: ListingRecord,
  repos: Repositories,
): Promise<string | null> {
  if (!listing.sellerId) return null;
  const seller = await repos.findSellerById(listing.sellerId);
  return seller?.shopName ?? null;
}

export async function listingCardDto(
  listing: ListingRecord,
  storage: StorageClient,
  repos: Repositories,
) {
  return {
    id: listing.id,
    title: listing.title,
    category: listing.category,
    coinPrice: listing.coinPrice,
    houseModelImageUrl: await storage.getSignedUrl(listing.houseModelRenderKey),
    sellerId: listing.sellerId,
    sellerName: await sellerNameForListing(listing, repos),
    affiliateUrl: listing.affiliateUrl,
  };
}

export async function listingDetailDto(
  listing: ListingRecord,
  variants: ListingVariantRecord[],
  storage: StorageClient,
  repos: Repositories,
) {
  const card = await listingCardDto(listing, storage, repos);
  const variantDtos = await Promise.all(
    variants.map(async (variant) => ({
      id: variant.id,
      size: variant.size,
      color: variant.color,
      garmentImageUrl: await storage.getSignedUrl(variant.garmentImageKey),
    })),
  );

  return {
    ...card,
    tags: listing.tags,
    variants: variantDtos,
  };
}
