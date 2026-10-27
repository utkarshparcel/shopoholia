/**
 * N52 — Complete-the-look: owned wardrobe pieces + missing slots filled
 * with affiliate listings. Builds on missing-piece slot heuristics (N31).
 */

import { categorySlot, type GarmentSlot } from "./outfit-goes-with.js";

export type LookOwnedItem = {
  id: string;
  category: string;
  colors?: string[] | null;
  brand?: string | null;
};

export type LookListingLike = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  affiliateUrl: string | null;
  affiliateLinks?: Array<{ url: string; platform: string; label?: string }> | null;
  status?: string;
};

/** Core slots for a casual complete look (dress can stand in for top+bottom). */
export const CORE_LOOK_SLOTS: GarmentSlot[] = ["top", "bottom", "shoes"];

export type FilledSlot = {
  slot: GarmentSlot;
  item: LookOwnedItem;
};

export type MissingSlotGap = {
  slot: GarmentSlot;
  message: string;
  /** How many owned pieces would pair with this gap. */
  ownedCompanions: number;
};

export type AffiliateFill = {
  slot: GarmentSlot;
  listingId: string;
  title: string;
  affiliateUrl: string | null;
  platform: string;
  score: number;
  reasons: string[];
};

export type CompleteLookResult = {
  owned: FilledSlot[];
  missing: AffiliateFill[];
  gaps: MissingSlotGap[];
  summary: string;
};

function listingAffiliate(listing: LookListingLike): {
  url: string | null;
  platform: string;
} {
  if (listing.affiliateLinks && listing.affiliateLinks.length > 0) {
    const first = listing.affiliateLinks[0]!;
    return { url: first.url, platform: first.platform };
  }
  return { url: listing.affiliateUrl, platform: "other" };
}

/** Map owned items onto garment slots (first wins per slot). */
export function filledLookSlots(items: LookOwnedItem[]): FilledSlot[] {
  const bySlot = new Map<GarmentSlot, LookOwnedItem>();
  for (const item of items) {
    const slot = categorySlot(item.category);
    if (slot === "other" || slot === "accessory") continue;
    if (!bySlot.has(slot)) bySlot.set(slot, item);
  }
  // Dress covers top+bottom for look completeness
  if (bySlot.has("dress")) {
    bySlot.delete("top");
    bySlot.delete("bottom");
  }
  return [...bySlot.entries()].map(([slot, item]) => ({ slot, item }));
}

/**
 * Missing-piece gaps for a wardrobe / partial outfit.
 * Dress fills top+bottom; otherwise expect top, bottom, shoes.
 */
export function detectMissingSlots(items: LookOwnedItem[]): MissingSlotGap[] {
  const filled = filledLookSlots(items);
  const have = new Set(filled.map((f) => f.slot));
  const gaps: MissingSlotGap[] = [];

  const needed: GarmentSlot[] = have.has("dress")
    ? ["shoes"]
    : [...CORE_LOOK_SLOTS];

  for (const slot of needed) {
    if (have.has(slot)) continue;
    if (slot === "top" || slot === "bottom") {
      if (have.has("dress")) continue;
    }
    const companions = filled.length;
    gaps.push({
      slot,
      ownedCompanions: companions,
      message:
        companions > 0
          ? `Need a ${slot} to complete ${companions} owned piece${companions === 1 ? "" : "s"}`
          : `Need a ${slot} to start a look`,
    });
  }
  return gaps;
}

function slotMatchesListing(slot: GarmentSlot, listing: LookListingLike): boolean {
  return categorySlot(listing.category) === slot;
}

function scoreListingForSlot(
  slot: GarmentSlot,
  listing: LookListingLike,
  owned: LookOwnedItem[],
): { score: number; reasons: string[] } {
  if (listing.status && listing.status !== "ACTIVE") {
    return { score: 0, reasons: [] };
  }
  if (!slotMatchesListing(slot, listing)) return { score: 0, reasons: [] };

  const reasons: string[] = [`Fills missing ${slot}`];
  let score = 20;

  const ownedColors = new Set(
    owned.flatMap((o) => (o.colors ?? []).map((c) => c.toLowerCase())),
  );
  const hints = [
    ...listing.tags.map((t) => t.toLowerCase()),
    ...listing.title.toLowerCase().split(/\s+/),
  ];
  const colorHits = [...ownedColors].filter((c) =>
    hints.some((h) => h === c || h.includes(c)),
  );
  if (colorHits.length > 0) {
    score += colorHits.length * 8;
    reasons.push("Pairs with owned colors");
  }

  const { url } = listingAffiliate(listing);
  if (url) {
    score += 5;
    reasons.push("Affiliate available");
  } else {
    score -= 5;
  }

  return { score, reasons };
}

/**
 * Build a complete look: owned slots + affiliate fills for missing ones.
 */
export function buildCompleteLook(input: {
  owned: LookOwnedItem[];
  listings: LookListingLike[];
  limitPerSlot?: number;
}): CompleteLookResult {
  const owned = filledLookSlots(input.owned);
  const gaps = detectMissingSlots(input.owned);
  const limitPerSlot = input.limitPerSlot ?? 1;
  const missing: AffiliateFill[] = [];

  for (const gap of gaps) {
    const candidates: AffiliateFill[] = [];
    for (const listing of input.listings) {
      const { score, reasons } = scoreListingForSlot(gap.slot, listing, input.owned);
      if (score <= 0) continue;
      const { url, platform } = listingAffiliate(listing);
      candidates.push({
        slot: gap.slot,
        listingId: listing.id,
        title: listing.title,
        affiliateUrl: url,
        platform,
        score,
        reasons,
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    missing.push(...candidates.slice(0, limitPerSlot));
  }

  const summaryParts: string[] = [];
  if (owned.length > 0) {
    summaryParts.push(`${owned.length} owned`);
  }
  if (missing.length > 0) {
    summaryParts.push(`${missing.length} affiliate fill(s)`);
  } else if (gaps.length > 0) {
    summaryParts.push(`${gaps.length} gap(s) with no listing yet`);
  } else {
    summaryParts.push("look already complete");
  }

  return {
    owned,
    missing,
    gaps,
    summary: summaryParts.join(" · "),
  };
}
