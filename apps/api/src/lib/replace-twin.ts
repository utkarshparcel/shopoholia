/**
 * N51 — Replace worn-out twin via affiliate.
 * Match a DEAD wardrobe item to similar Play listings for repurchase.
 */

export type TwinSeed = {
  id: string;
  category: string;
  colors?: string[] | null;
  brand?: string | null;
};

export type TwinListingLike = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  affiliateUrl: string | null;
  affiliateLinks?: Array<{ url: string; platform: string; label?: string }> | null;
  status?: string;
};

export type TwinMatchQuery = {
  category: string;
  colors: string[];
  brand: string | null;
  tokens: string[];
};

export type TwinCandidate = {
  listingId: string;
  title: string;
  category: string;
  score: number;
  affiliateUrl: string | null;
  platform: string;
  reasons: string[];
  matchQuery: TwinMatchQuery;
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "in",
  "on",
  "with",
  "for",
  "to",
  "solid",
  "printed",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Build a stable match query from a dead wardrobe item. */
export function buildTwinMatchQuery(item: TwinSeed): TwinMatchQuery {
  const category = item.category.trim().toLowerCase();
  const colors = (item.colors ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const brand = item.brand?.trim() ? item.brand.trim().toLowerCase() : null;
  const tokens = [
    ...tokenize(item.category),
    ...colors.flatMap((c) => tokenize(c)),
    ...(brand ? tokenize(brand) : []),
  ];
  return { category, colors, brand, tokens: [...new Set(tokens)] };
}

function listingColorHints(listing: TwinListingLike): string[] {
  const fromTags = listing.tags.map((t) => t.toLowerCase());
  const fromTitle = tokenize(listing.title);
  return [...new Set([...fromTags, ...fromTitle])];
}

/**
 * Score how well a listing replaces the dead item.
 * Higher is better; 0 means not a twin.
 */
export function twinMatchScore(
  query: TwinMatchQuery,
  listing: TwinListingLike,
): { score: number; reasons: string[] } {
  if (listing.status && listing.status !== "ACTIVE") {
    return { score: 0, reasons: [] };
  }
  const reasons: string[] = [];
  let score = 0;

  const listingCat = listing.category.trim().toLowerCase();
  if (listingCat === query.category) {
    score += 40;
    reasons.push("Same category");
  } else if (
    listingCat.includes(query.category) ||
    query.category.includes(listingCat) ||
    query.tokens.some((t) => listingCat.includes(t))
  ) {
    score += 20;
    reasons.push("Related category");
  } else {
    // Still allow soft tag/title overlap for near-twins
    score += 0;
  }

  const hints = listingColorHints(listing);
  const colorHits = query.colors.filter((c) =>
    hints.some((h) => h === c || h.includes(c) || c.includes(h)),
  );
  if (colorHits.length > 0) {
    score += colorHits.length * 12;
    reasons.push(`Color match: ${colorHits.slice(0, 2).join(", ")}`);
  }

  if (query.brand) {
    const hay = `${listing.title} ${listing.tags.join(" ")}`.toLowerCase();
    if (hay.includes(query.brand)) {
      score += 15;
      reasons.push("Brand match");
    }
  }

  const titleTokens = new Set(tokenize(listing.title));
  let tokenHits = 0;
  for (const t of query.tokens) {
    if (titleTokens.has(t) || listing.tags.some((tag) => tag.toLowerCase().includes(t))) {
      tokenHits += 1;
    }
  }
  if (tokenHits > 0) {
    score += Math.min(tokenHits * 5, 20);
    reasons.push("Title/tag overlap");
  }

  if (!listing.affiliateUrl && !(listing.affiliateLinks && listing.affiliateLinks.length > 0)) {
    // Still scoreable but demote — no repurchase rail
    score = Math.max(0, score - 10);
  }

  // Require at least category kinship or a strong color+token signal
  if (score < 20) return { score: 0, reasons: [] };
  return { score, reasons };
}

function pickAffiliate(
  listing: TwinListingLike,
): { url: string | null; platform: string } {
  if (listing.affiliateLinks && listing.affiliateLinks.length > 0) {
    const first = listing.affiliateLinks[0]!;
    return { url: first.url, platform: first.platform };
  }
  if (listing.affiliateUrl) {
    return { url: listing.affiliateUrl, platform: "other" };
  }
  return { url: null, platform: "other" };
}

/** Rank affiliate listings that can replace a worn-out twin. */
export function findReplaceTwins(
  item: TwinSeed,
  listings: TwinListingLike[],
  opts?: { limit?: number },
): TwinCandidate[] {
  const limit = opts?.limit ?? 10;
  const matchQuery = buildTwinMatchQuery(item);
  const scored: TwinCandidate[] = [];

  for (const listing of listings) {
    const { score, reasons } = twinMatchScore(matchQuery, listing);
    if (score <= 0) continue;
    const { url, platform } = pickAffiliate(listing);
    scored.push({
      listingId: listing.id,
      title: listing.title,
      category: listing.category,
      score,
      affiliateUrl: url,
      platform,
      reasons,
      matchQuery,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored.slice(0, limit);
}
