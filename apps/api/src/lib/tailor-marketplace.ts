import type { Repositories, SellerRecord } from "./repositories/types.js";

const DEFAULT_TAILOR_SHOP = "WORN Studio Tailors";

/**
 * Ensure at least one TAILOR seller exists (seed) and return the assigned seller id.
 * Prefer an explicit sellerId when it resolves to an active TAILOR.
 */
export async function assignTailorSeller(
  repos: Repositories,
  preferredSellerId?: string | null,
): Promise<string> {
  if (preferredSellerId) {
    const preferred = await repos.findSellerById(preferredSellerId);
    if (preferred && preferred.status === "ACTIVE" && preferred.sellerType === "TAILOR") {
      return preferred.id;
    }
  }

  const tailors = await repos.listSellersByType("TAILOR");
  const active = tailors.find((t) => t.status === "ACTIVE");
  if (active) return active.id;

  const seeded = await repos.ensureDefaultTailorSeller(DEFAULT_TAILOR_SHOP);
  return seeded.id;
}

export function tailorRatingAvg(
  reviews: Array<{ rating: number }>,
): number | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

export type TailorListItem = {
  id: string;
  shopName: string;
  sellerType: "TAILOR";
  ratingAvg: number | null;
  reviewCount: number;
};

export async function listTailorMarketplace(
  repos: Repositories,
): Promise<TailorListItem[]> {
  await repos.ensureDefaultTailorSeller(DEFAULT_TAILOR_SHOP);
  const sellers = await repos.listSellersByType("TAILOR");
  const out: TailorListItem[] = [];
  for (const s of sellers.filter((x) => x.status === "ACTIVE")) {
    const reviews = await repos.listTailoringReviews(s.id);
    out.push({
      id: s.id,
      shopName: s.shopName,
      sellerType: "TAILOR",
      ratingAvg: tailorRatingAvg(reviews),
      reviewCount: reviews.length,
    });
  }
  return out;
}

export function isTailorSeller(seller: SellerRecord | null): seller is SellerRecord & {
  sellerType: "TAILOR";
} {
  return Boolean(seller && seller.sellerType === "TAILOR" && seller.status === "ACTIVE");
}
