/**
 * W058 — Complete-look affiliate sheet (Closet-framed bridge).
 * Owned slots stay Closet; missing fills are affiliate CTAs with cashback click.
 */

export type CompleteLookOwnedLike = {
  slot: string;
  item: { id: string; category: string; brand?: string | null };
};

export type CompleteLookMissingLike = {
  slot: string;
  listingId: string;
  title: string;
  affiliateUrl: string | null;
  platform: string;
};

export type CompleteLookSheetModel = {
  title: string;
  subtitle: string;
  ownedLabels: string[];
  fills: Array<{
    slot: string;
    listingId: string;
    title: string;
    affiliateUrl: string;
    platform: string;
    ctaLabel: string;
  }>;
  emptyFillsHint: string | null;
};

/** Infer affiliate platform for cashback click recording. */
export function platformFromAffiliateUrl(url: string, fallback = "other"): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("amazon")) return "amazon";
    if (host.includes("flipkart")) return "flipkart";
    if (host.includes("myntra")) return "myntra";
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Closet-framed sheet model — never Play shopping copy.
 */
export function buildCompleteLookSheet(input: {
  owned: CompleteLookOwnedLike[];
  missing: CompleteLookMissingLike[];
  summary?: string | null;
}): CompleteLookSheetModel {
  const ownedLabels = input.owned.map((o) => {
    const brand = o.item.brand?.trim();
    return brand ? `${o.slot}: ${brand} (${o.item.category})` : `${o.slot}: ${o.item.category}`;
  });
  const fills = input.missing
    .filter((m) => Boolean(m.affiliateUrl?.trim()))
    .map((m) => {
      const url = m.affiliateUrl!.trim();
      const platform = m.platform?.trim() || platformFromAffiliateUrl(url);
      return {
        slot: m.slot,
        listingId: m.listingId,
        title: m.title,
        affiliateUrl: url,
        platform,
        ctaLabel: `Fill ${m.slot}`,
      };
    });
  return {
    title: "Complete your look",
    subtitle:
      input.summary?.trim() ||
      "Pieces you own, plus Closet fills for gaps — cashback tracked on tap.",
    ownedLabels,
    fills,
    emptyFillsHint:
      fills.length === 0
        ? ownedLabels.length > 0
          ? "Your closet already covers the core slots."
          : "Add a few pieces, then reopen to fill gaps."
        : null,
  };
}
