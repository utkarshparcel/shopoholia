/**
 * WV07-RANK-BUDGET — rank gift ideas by taste tags within a budget cap.
 * Returns up to `limit` (default 3) listings: "3 gifts in budget".
 */

export type RankableGiftListing = {
  id: string;
  title: string;
  category: string;
  tags?: string[] | null;
  coinPrice: number;
  affiliateUrl?: string | null;
};

export type RankedGiftIdea = {
  id: string;
  title: string;
  category: string;
  coinPrice: number;
  affiliateUrl: string | null;
  reason: string;
  score: number;
};

export const DEFAULT_GIFT_IDEA_LIMIT = 3;

function tasteScore(listing: RankableGiftListing, tasteLower: string[]): number {
  if (tasteLower.length === 0) return 0;
  const tagsLower = (listing.tags ?? []).map((t) => t.toLowerCase());
  const catLower = listing.category.toLowerCase();
  const titleLower = listing.title.toLowerCase();
  let score = 0;
  for (const t of tasteLower) {
    if (tagsLower.includes(t)) score += 3;
    else if (catLower.includes(t)) score += 2;
    else if (titleLower.includes(t)) score += 1;
  }
  return score;
}

function wishlistScore(listing: RankableGiftListing, wishlistLower: string[]): number {
  if (wishlistLower.length === 0) return 0;
  const titleLower = listing.title.toLowerCase();
  return wishlistLower.some((w) => titleLower.includes(w) || w.includes(titleLower)) ? 2 : 0;
}

function reasonFor(
  listing: RankableGiftListing,
  taste: string[],
  tastePts: number,
  wishPts: number,
): string {
  if (tastePts > 0 && taste.length > 0) {
    const matched = taste.filter((t) => {
      const tl = t.toLowerCase();
      return (
        (listing.tags ?? []).some((x) => x.toLowerCase() === tl) ||
        listing.category.toLowerCase().includes(tl) ||
        listing.title.toLowerCase().includes(tl)
      );
    });
    if (matched.length > 0) return `Matches ${matched.slice(0, 2).join(", ")}`;
  }
  if (wishPts > 0) return "Wishlist match";
  return "Popular pick";
}

/**
 * Rank listings by taste-tag overlap (+ wishlist boost), optionally filter by
 * coin budget, take top N. Stable tie-break: higher score → lower coinPrice → id.
 */
export function rankGiftIdeas(input: {
  listings: RankableGiftListing[];
  tasteTags?: string[] | null;
  /** Free-text wishlist titles — boost score when they overlap listing title. */
  wishlistTitles?: string[] | null;
  /** Max coinPrice inclusive; omit/null = no budget filter. */
  budgetCap?: number | null;
  limit?: number;
}): RankedGiftIdea[] {
  const limit = Math.max(0, input.limit ?? DEFAULT_GIFT_IDEA_LIMIT);
  const taste = (input.tasteTags ?? []).map((t) => t.trim()).filter(Boolean);
  const tasteLower = taste.map((t) => t.toLowerCase());
  const wishlistLower = (input.wishlistTitles ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const cap =
    input.budgetCap != null && Number.isFinite(input.budgetCap) && input.budgetCap >= 0
      ? Math.floor(input.budgetCap)
      : null;

  const pool =
    cap == null ? input.listings : input.listings.filter((l) => l.coinPrice <= cap);

  const scored = pool.map((l) => {
    const tPts = tasteScore(l, tasteLower);
    const wPts = wishlistScore(l, wishlistLower);
    const score = tPts + wPts;
    return {
      id: l.id,
      title: l.title,
      category: l.category,
      coinPrice: l.coinPrice,
      affiliateUrl: l.affiliateUrl ?? null,
      reason: reasonFor(l, taste, tPts, wPts),
      score,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.coinPrice !== b.coinPrice) return a.coinPrice - b.coinPrice;
    return a.id.localeCompare(b.id);
  });

  // Prefer matches when any exist; otherwise keep popular (score 0) pool.
  const withMatch = scored.filter((x) => x.score > 0);
  const ranked = withMatch.length > 0 ? withMatch : scored;
  return ranked.slice(0, limit);
}
