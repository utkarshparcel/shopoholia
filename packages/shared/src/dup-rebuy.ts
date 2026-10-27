/**
 * Title/brand similarity for "you already own this" warnings.
 * Used at Play checkout and Closet ingest — warn only, never block.
 */

export type OwnedItemLike = {
  id: string;
  /** Wardrobe: brand + category; purchase items: title. */
  title?: string | null;
  brand?: string | null;
  category?: string | null;
};

export type CandidateLike = {
  title: string;
  brand?: string | null;
  listingId?: string;
  purchaseItemId?: string;
};

export type DuplicateMatchResult = {
  wardrobeItemId: string;
  wardrobeLabel: string;
  wardrobeBrand: string | null;
  score: number;
  reason: string;
};

export type DuplicateWarningResult = {
  candidateTitle: string;
  candidateBrand: string | null;
  listingId?: string;
  purchaseItemId?: string;
  matches: DuplicateMatchResult[];
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "in",
  "on",
  "with",
  "size",
  "pack",
  "set",
  "men",
  "women",
  "mens",
  "womens",
  "unisex",
  "cotton",
  "polyester",
]);

/** Normalize for token comparison. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/**
 * Jaccard-ish overlap on significant tokens, boosted when brand tokens align.
 * Returns 0..1.
 */
export function similarityScore(
  a: string,
  b: string,
  brandA?: string | null,
  brandB?: string | null,
): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) {
    // brand-only fallback
    if (brandA && brandB && normalizeText(brandA) === normalizeText(brandB)) {
      return 0.55;
    }
    return 0;
  }
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  let score = union > 0 ? inter / union : 0;

  const ba = brandA ? normalizeText(brandA) : "";
  const bb = brandB ? normalizeText(brandB) : "";
  if (ba && bb && ba === bb) {
    score = Math.min(1, score + 0.25);
  } else if (ba && tokenize(b).includes(ba)) {
    score = Math.min(1, score + 0.2);
  } else if (bb && tokenize(a).includes(bb)) {
    score = Math.min(1, score + 0.2);
  }

  // Exact normalized title match
  if (normalizeText(a) === normalizeText(b) && normalizeText(a).length >= 4) {
    score = Math.max(score, 0.95);
  }

  return Math.round(score * 1000) / 1000;
}

export function ownedLabel(item: OwnedItemLike): string {
  const parts = [item.brand, item.title ?? item.category].filter(Boolean);
  return parts.join(" ").trim() || "wardrobe item";
}

/**
 * Find wardrobe (or prior purchase) items that look like the candidate.
 * Default threshold 0.55 catches brand+category and strong title overlaps.
 */
export function findDuplicateMatches(
  candidate: CandidateLike,
  owned: OwnedItemLike[],
  threshold = 0.55,
): DuplicateWarningResult | null {
  const matches: DuplicateMatchResult[] = [];
  for (const o of owned) {
    const label = ownedLabel(o);
    const ownedTitle = o.title ?? [o.brand, o.category].filter(Boolean).join(" ");
    const score = similarityScore(
      candidate.title,
      ownedTitle,
      candidate.brand,
      o.brand,
    );
    if (score >= threshold) {
      const reason =
        candidate.brand &&
        o.brand &&
        normalizeText(candidate.brand) === normalizeText(o.brand)
          ? "brand_and_title"
          : score >= 0.9
            ? "title_exact"
            : "title_overlap";
      matches.push({
        wardrobeItemId: o.id,
        wardrobeLabel: label,
        wardrobeBrand: o.brand ?? null,
        score,
        reason,
      });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.score - a.score);
  return {
    candidateTitle: candidate.title,
    candidateBrand: candidate.brand ?? null,
    listingId: candidate.listingId,
    purchaseItemId: candidate.purchaseItemId,
    matches: matches.slice(0, 3),
  };
}

export function findDuplicateWarnings(
  candidates: CandidateLike[],
  owned: OwnedItemLike[],
  threshold = 0.55,
): DuplicateWarningResult[] {
  const out: DuplicateWarningResult[] = [];
  for (const c of candidates) {
    const w = findDuplicateMatches(c, owned, threshold);
    if (w) out.push(w);
  }
  return out;
}

/** W040 — Play checkout soft banner; Closet deep link; never blocks pay. */
export const DUP_REBUY_CLOSET_HREF = "/(closet)/wardrobe" as const;
export const DUP_REBUY_SOFT_FOOTER =
  "Soft warn only — you can still pay whenever you like.";
export const DUP_REBUY_CLOSET_CTA = "Open Closet" as const;

export type DupRebuyBannerOverlap = {
  candidateTitle: string;
  wardrobeLabel: string;
  wardrobeItemId?: string;
};

export type DupRebuyBannerWarning = {
  candidateTitle: string;
  matches: Array<{ wardrobeLabel: string; wardrobeItemId?: string }>;
};

export type PlayDupRebuyBanner = {
  kicker: string;
  message: string;
  detail: string | null;
  softNote: string;
  closetLabel: string;
  closetHref: typeof DUP_REBUY_CLOSET_HREF;
  /** Always false — acceptance: never blocks pay. */
  blocksPay: false;
};

/**
 * Soft duplicate-rebuy copy for Play checkout (anti-impulse, non-blocking).
 * Accepts prebuy overlaps and/or N11 duplicateWarnings.
 */
export function playDupRebuyBanner(input: {
  overlaps?: DupRebuyBannerOverlap[] | null;
  warnings?: DupRebuyBannerWarning[] | null;
}): PlayDupRebuyBanner | null {
  const fromOverlaps = (input.overlaps ?? [])
    .filter((o) => o.candidateTitle.trim() && o.wardrobeLabel.trim())
    .map((o) => ({
      candidateTitle: o.candidateTitle.trim(),
      wardrobeLabel: o.wardrobeLabel.trim(),
      wardrobeItemId: o.wardrobeItemId,
    }));
  const fromWarnings = (input.warnings ?? []).flatMap((w) => {
    const top = w.matches[0];
    if (!top || !w.candidateTitle.trim()) return [];
    return [
      {
        candidateTitle: w.candidateTitle.trim(),
        wardrobeLabel: top.wardrobeLabel.trim(),
        wardrobeItemId: top.wardrobeItemId,
      },
    ];
  });

  const rows = fromOverlaps.length > 0 ? fromOverlaps : fromWarnings;
  if (rows.length === 0) return null;

  const first = rows[0]!;
  const uniqueCandidates = new Set(rows.map((r) => r.candidateTitle.toLowerCase()));
  const count = uniqueCandidates.size;
  const message =
    count === 1
      ? `You may already own something like “${first.candidateTitle}”.`
      : `${count} haul items look similar to pieces already in Closet.`;
  const detail =
    count === 1
      ? `Closest match: ${first.wardrobeLabel}`
      : `e.g. ${first.candidateTitle} ≈ ${first.wardrobeLabel}`;

  return {
    kicker: "Already own this?",
    message,
    detail,
    softNote: DUP_REBUY_SOFT_FOOTER,
    closetLabel: DUP_REBUY_CLOSET_CTA,
    closetHref: DUP_REBUY_CLOSET_HREF,
    blocksPay: false,
  };
}
