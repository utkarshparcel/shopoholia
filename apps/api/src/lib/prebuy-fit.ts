import {
  isBudgetExceeded,
  mapCategoryToBudgetCategory,
  budgetNudgeMessage,
  budgetHaulAwarenessMessage,
} from "./budget.js";
import type { Repositories } from "./repositories/types.js";

/** Candidate Play listing / cart line for closet fit + budget projection. */
export type PrebuyCandidate = {
  title: string;
  category: string | null;
  brand?: string | null;
  /** Estimated INR paise (from realPrice or coin fallback). */
  priceMinor: number;
  qty?: number;
  listingId?: string | null;
};

export type PrebuyWardrobeItem = {
  id: string;
  category: string;
  brand: string | null;
  /** Optional title-like label; wardrobe rows store category/brand, not title. */
  label?: string | null;
};

export type PrebuyBudgetContext = {
  category: string;
  period: string;
  limitMinor: number;
  /** Spend already booked in the current period for this category. */
  actualMinor: number;
};

export type PrebuyOverlap = {
  candidateTitle: string;
  wardrobeItemId: string;
  wardrobeLabel: string;
  score: number;
  reason: "TITLE" | "CATEGORY_BRAND" | "CATEGORY";
};

export type PrebuyGap = {
  category: string;
  budgetCategory: string;
  ownedCount: number;
  message: string;
};

export type PrebuyBudgetNudge = {
  exceeded: boolean;
  category: string;
  limitMinor: number;
  actualMinor: number;
  proposedMinor: number;
  projectedMinor: number;
  message: string;
};

export type PrebuyFitResult = {
  /** 0–100; higher = safer buy (less overlap, fills gaps, under budget). */
  score: number;
  overlaps: PrebuyOverlap[];
  gaps: PrebuyGap[];
  budgetNudges: PrebuyBudgetNudge[];
  softBlock: boolean;
  summary: string;
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
]);

/** Parse display prices like "₹2,499" / "2499" into paise. */
export function parseRealPriceToMinor(realPrice: string | null | undefined): number | null {
  if (!realPrice) return null;
  const digits = realPrice.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const rupees = Number.parseFloat(digits);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

/** Play coin → paise estimate when realPrice is missing (1 coin ≈ ₹1). */
export function estimatePriceMinorFromCoins(coinPrice: number, qty = 1): number {
  return Math.max(0, Math.round(coinPrice) * 100) * Math.max(1, qty);
}

export function resolveCandidatePriceMinor(input: {
  realPrice?: string | null;
  coinPrice: number;
  qty?: number;
}): number {
  const qty = input.qty ?? 1;
  const fromReal = parseRealPriceToMinor(input.realPrice);
  if (fromReal != null) return fromReal * qty;
  return estimatePriceMinorFromCoins(input.coinPrice, qty);
}

export function tokenizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/** Jaccard similarity over title tokens, 0–1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokenizeTitle(a);
  const tb = tokenizeTitle(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function wardrobeLabel(item: PrebuyWardrobeItem): string {
  const parts = [item.brand, item.category, item.label].filter(Boolean);
  return parts.join(" ") || item.category;
}

/**
 * Pure pre-buy fit: overlap with owned closet, category gaps, and budget nudges.
 * Soft awareness only — never a hard checkout block.
 */
export function computePrebuyFit(
  candidates: PrebuyCandidate[],
  wardrobe: PrebuyWardrobeItem[],
  budgets: PrebuyBudgetContext[],
): PrebuyFitResult {
  const overlaps: PrebuyOverlap[] = [];
  for (const c of candidates) {
    for (const w of wardrobe) {
      const label = wardrobeLabel(w);
      const sim = titleSimilarity(c.title, label);
      const sameCat =
        mapCategoryToBudgetCategory(c.category) === mapCategoryToBudgetCategory(w.category);
      const sameBrand =
        Boolean(c.brand && w.brand) &&
        c.brand!.trim().toLowerCase() === w.brand!.trim().toLowerCase();

      if (sim >= 0.45) {
        overlaps.push({
          candidateTitle: c.title,
          wardrobeItemId: w.id,
          wardrobeLabel: label,
          score: Math.round(sim * 100),
          reason: "TITLE",
        });
      } else if (sameCat && sameBrand) {
        overlaps.push({
          candidateTitle: c.title,
          wardrobeItemId: w.id,
          wardrobeLabel: label,
          score: 70,
          reason: "CATEGORY_BRAND",
        });
      } else if (sameCat && sim >= 0.25) {
        overlaps.push({
          candidateTitle: c.title,
          wardrobeItemId: w.id,
          wardrobeLabel: label,
          score: Math.round(40 + sim * 40),
          reason: "CATEGORY",
        });
      }
    }
  }

  // Dedupe overlaps by candidate+wardrobe pair, keep highest score
  const overlapKey = new Map<string, PrebuyOverlap>();
  for (const o of overlaps) {
    const k = `${o.candidateTitle}::${o.wardrobeItemId}`;
    const prev = overlapKey.get(k);
    if (!prev || o.score > prev.score) overlapKey.set(k, o);
  }
  const uniqueOverlaps = [...overlapKey.values()].sort((a, b) => b.score - a.score);

  const ownedByBudget = new Map<string, number>();
  for (const w of wardrobe) {
    const bc = mapCategoryToBudgetCategory(w.category);
    ownedByBudget.set(bc, (ownedByBudget.get(bc) ?? 0) + 1);
  }

  const gaps: PrebuyGap[] = [];
  const seenGap = new Set<string>();
  for (const c of candidates) {
    const bc = mapCategoryToBudgetCategory(c.category);
    if (seenGap.has(bc)) continue;
    seenGap.add(bc);
    const owned = ownedByBudget.get(bc) ?? 0;
    if (owned < 2) {
      gaps.push({
        category: c.category ?? bc,
        budgetCategory: bc,
        ownedCount: owned,
        message:
          owned === 0
            ? `You own nothing in ${bc} — this fills a closet gap.`
            : `Thin ${bc} shelf (${owned} piece) — useful gap fill.`,
      });
    }
  }

  const proposedByCat = new Map<string, number>();
  for (const c of candidates) {
    const bc = mapCategoryToBudgetCategory(c.category);
    const amount = c.priceMinor * (c.qty ?? 1);
    proposedByCat.set(bc, (proposedByCat.get(bc) ?? 0) + amount);
    proposedByCat.set("GENERAL", (proposedByCat.get("GENERAL") ?? 0) + amount);
  }

  const budgetNudges: PrebuyBudgetNudge[] = [];
  for (const b of budgets) {
    const proposed = proposedByCat.get(b.category) ?? 0;
    if (proposed <= 0 && b.category !== "GENERAL") continue;
    const projected = b.actualMinor + proposed;
    const exceeded = projected > b.limitMinor;
    if (!exceeded && proposed === 0) continue;
    budgetNudges.push({
      exceeded,
      category: b.category,
      limitMinor: b.limitMinor,
      actualMinor: b.actualMinor,
      proposedMinor: proposed,
      projectedMinor: projected,
      message: exceeded
        ? budgetNudgeMessage(b.category, b.limitMinor, projected)
        : budgetHaulAwarenessMessage(b.category, proposed, b.limitMinor),
    });
  }

  const softBlock = budgetNudges.some((n) => n.exceeded);

  // Score: start 80, −overlap penalty, +gap fill, −budget exceed
  let score = 80;
  score -= Math.min(40, uniqueOverlaps.length * 12 + uniqueOverlaps.reduce((s, o) => s + o.score / 20, 0));
  score += Math.min(15, gaps.length * 8);
  if (softBlock) score -= 25;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const parts: string[] = [];
  if (uniqueOverlaps.length > 0) {
    parts.push(`Looks similar to ${uniqueOverlaps.length} piece${uniqueOverlaps.length === 1 ? "" : "s"} you already own`);
  }
  if (gaps.length > 0) {
    parts.push(`Fills ${gaps.length} closet gap(s)`);
  }
  if (softBlock) {
    parts.push("Over budget this period — soft nudge only");
  } else if (budgetNudges.length > 0) {
    parts.push("Within budget");
  }
  const summary = parts.length > 0 ? parts.join(". ") + "." : "No strong closet signals for this haul.";

  return {
    score,
    overlaps: uniqueOverlaps,
    gaps,
    budgetNudges,
    softBlock,
    summary,
  };
}

export async function loadBudgetContexts(
  repos: Repositories,
  userId: string,
): Promise<PrebuyBudgetContext[]> {
  const budgets = await repos.listBudgets(userId);
  const out: PrebuyBudgetContext[] = [];
  for (const b of budgets) {
    const status = await isBudgetExceeded(repos, userId, b.category);
    out.push({
      category: b.category,
      period: b.period,
      limitMinor: b.limitMinor,
      actualMinor: status.actualMinor,
    });
  }
  return out;
}

export async function candidatesFromCart(
  repos: Repositories,
  userId: string,
): Promise<PrebuyCandidate[]> {
  const cart = await repos.getOrCreateCart(userId);
  const rows = await repos.getCartItems(cart.id);
  if (rows.length === 0) return [];
  const variants = await repos.findVariantsByIds(rows.map((r) => r.listingVariantId));
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const listings = await repos.findListingsByIds([...new Set(variants.map((v) => v.listingId))]);
  const listingMap = new Map(listings.map((l) => [l.id, l]));
  const out: PrebuyCandidate[] = [];
  for (const row of rows) {
    const variant = variantMap.get(row.listingVariantId);
    const listing = variant ? listingMap.get(variant.listingId) : null;
    if (!listing) continue;
    out.push({
      title: listing.title,
      category: listing.category,
      brand: null,
      priceMinor: resolveCandidatePriceMinor({
        realPrice: listing.realPrice,
        coinPrice: row.coinPriceSnapshot,
        qty: row.quantity,
      }),
      qty: 1,
      listingId: listing.id,
    });
  }
  return out;
}

export async function candidatesFromListingIds(
  repos: Repositories,
  listingIds: string[],
): Promise<PrebuyCandidate[]> {
  if (listingIds.length === 0) return [];
  const listings = await repos.findListingsByIds(listingIds);
  return listings.map((l) => ({
    title: l.title,
    category: l.category,
    brand: null,
    priceMinor: resolveCandidatePriceMinor({
      realPrice: l.realPrice,
      coinPrice: l.coinPrice,
      qty: 1,
    }),
    qty: 1,
    listingId: l.id,
  }));
}

export async function evaluatePrebuyFit(
  repos: Repositories,
  userId: string,
  candidates: PrebuyCandidate[],
): Promise<PrebuyFitResult> {
  const wardrobeRows = await repos.listWardrobeItems(userId);
  const wardrobe: PrebuyWardrobeItem[] = wardrobeRows.map((w) => ({
    id: w.id,
    category: w.category,
    brand: w.brand,
    label: w.brand ? `${w.brand} ${w.category}` : w.category,
  }));
  const budgets = await loadBudgetContexts(repos, userId);
  return computePrebuyFit(candidates, wardrobe, budgets);
}
