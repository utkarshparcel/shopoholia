/**
 * W068 — missing-piece shop sheet helpers (affiliate + cashback platform).
 */

export type MissingPieceGapLike = {
  missingSlot: string;
  suggestion: string;
  message: string;
  affiliateUrl: string;
  priority: number;
};

export type MissingPieceShopRow = MissingPieceGapLike & {
  platform: 'amazon' | 'flipkart' | 'myntra' | 'other';
  ctaLabel: string;
};

export function affiliatePlatformFromUrl(
  url: string,
): 'amazon' | 'flipkart' | 'myntra' | 'other' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('amazon')) return 'amazon';
    if (host.includes('flipkart')) return 'flipkart';
    if (host.includes('myntra')) return 'myntra';
  } catch {
    /* ignore */
  }
  return 'other';
}

export function missingPieceShopRows(
  gaps: MissingPieceGapLike[],
  limit = 8,
): MissingPieceShopRow[] {
  return gaps.slice(0, limit).map((g) => {
    const platform = affiliatePlatformFromUrl(g.affiliateUrl);
    return {
      ...g,
      platform,
      ctaLabel: `Shop ${g.suggestion}`,
    };
  });
}
