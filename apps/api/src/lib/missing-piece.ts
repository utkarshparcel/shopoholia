/**
 * N31-MISSING-PIECE — detect wardrobe gaps (“need black trousers for 4 tops”)
 * and emit a shopping list with Play / affiliate suggestions.
 */

import { categorySlot, type GarmentSlot } from "./outfit-goes-with.js";

export type MissingPieceItem = {
  id: string;
  category: string;
  colors?: string[] | null;
  brand?: string | null;
};

export type MissingPieceGap = {
  /** Slot the user is missing or thin on. */
  missingSlot: GarmentSlot;
  /** Human query for shopping / affiliate search. */
  suggestion: string;
  /** How many owned pieces would benefit from this gap fill. */
  unlockedByCount: number;
  /** Slot that is over-indexed relative to the gap. */
  anchorSlot: GarmentSlot;
  /** Optional color focus (e.g. black). */
  colorHint: string | null;
  message: string;
  /** Play affiliate / storefront deep link. */
  affiliateUrl: string;
  /** Relative urgency 0–100. */
  priority: number;
};

export type MissingPieceReport = {
  gaps: MissingPieceGap[];
  summary: string;
};

const SLOT_LABEL: Record<GarmentSlot, string> = {
  top: "tops",
  bottom: "trousers / bottoms",
  shoes: "shoes",
  outer: "outerwear",
  dress: "dresses",
  accessory: "accessories",
  other: "staples",
};

/** Build a Play-style affiliate search URL for a gap suggestion. */
export function affiliateSuggestionUrl(query: string, merchant = "myntra"): string {
  const q = encodeURIComponent(query.trim() || "wardrobe staple");
  const m = merchant.toLowerCase();
  if (m === "amazon" || m === "amazon.in") {
    return `https://www.amazon.in/s?k=${q}&tag=shopoholia-21`;
  }
  if (m === "flipkart") {
    return `https://www.flipkart.com/search?q=${q}&affid=yourshopoholia`;
  }
  // Default: Myntra fashion search (Play affiliate bridge)
  return `https://www.myntra.com/${q.replace(/%20/g, "-")}?ref=shopoholia`;
}

function countBySlot(items: MissingPieceItem[]): Map<GarmentSlot, MissingPieceItem[]> {
  const map = new Map<GarmentSlot, MissingPieceItem[]>();
  for (const it of items) {
    const slot = categorySlot(it.category);
    const list = map.get(slot) ?? [];
    list.push(it);
    map.set(slot, list);
  }
  return map;
}

function dominantNeutralColor(items: MissingPieceItem[]): string | null {
  const counts = new Map<string, number>();
  for (const it of items) {
    for (const c of it.colors ?? []) {
      const key = c.toLowerCase().trim();
      if (!key) continue;
      if (["black", "navy", "white", "beige", "grey", "gray", "khaki", "brown"].includes(key)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  let best: string | null = null;
  let n = 0;
  for (const [c, cnt] of counts) {
    if (cnt > n) {
      best = c;
      n = cnt;
    }
  }
  return best;
}

type PairRule = {
  anchor: GarmentSlot;
  missing: GarmentSlot;
  /** Anchor count must be at least this. */
  minAnchor: number;
  /** Missing count must be below this fraction of anchor (or absolute). */
  maxMissingRatio: number;
  absoluteMaxMissing?: number;
};

const PAIR_RULES: PairRule[] = [
  { anchor: "top", missing: "bottom", minAnchor: 2, maxMissingRatio: 0.5, absoluteMaxMissing: 1 },
  { anchor: "top", missing: "shoes", minAnchor: 2, maxMissingRatio: 0.4, absoluteMaxMissing: 1 },
  { anchor: "dress", missing: "shoes", minAnchor: 1, maxMissingRatio: 0.5, absoluteMaxMissing: 0 },
  { anchor: "bottom", missing: "top", minAnchor: 3, maxMissingRatio: 0.4, absoluteMaxMissing: 1 },
  { anchor: "top", missing: "accessory", minAnchor: 3, maxMissingRatio: 0.35, absoluteMaxMissing: 0 },
  { anchor: "bottom", missing: "shoes", minAnchor: 2, maxMissingRatio: 0.5, absoluteMaxMissing: 1 },
];

/**
 * Gap heuristic: when one slot is rich and its classic companion is thin/missing,
 * emit a shopping-list suggestion with affiliate URL.
 */
export function detectMissingPieces(
  items: MissingPieceItem[],
  opts?: { limit?: number; merchant?: string },
): MissingPieceReport {
  const limit = opts?.limit ?? 8;
  const merchant = opts?.merchant ?? "myntra";
  const bySlot = countBySlot(items);
  const gaps: MissingPieceGap[] = [];

  for (const rule of PAIR_RULES) {
    const anchors = bySlot.get(rule.anchor) ?? [];
    const missing = bySlot.get(rule.missing) ?? [];
    if (anchors.length < rule.minAnchor) continue;
    const ratio = missing.length / anchors.length;
    const thin =
      missing.length === 0 ||
      ratio < rule.maxMissingRatio ||
      (rule.absoluteMaxMissing != null && missing.length <= rule.absoluteMaxMissing);
    if (!thin) continue;

    const colorHint = dominantNeutralColor(anchors);
    const slotLabel = SLOT_LABEL[rule.missing];
    const suggestion = colorHint
      ? `${colorHint} ${slotLabel.replace(/s$/, "")}`.replace(/\s+/g, " ").trim()
      : slotLabel.replace(/ \/ .*/, "").replace(/s$/, "");
    // Prefer “black trousers” style phrasing for bottoms
    const prettySuggestion =
      rule.missing === "bottom" && colorHint
        ? `${colorHint} trousers`
        : rule.missing === "shoes" && colorHint
          ? `${colorHint} shoes`
          : suggestion;

    const unlockedByCount = anchors.length;
    const priority = Math.min(
      100,
      Math.round(30 + unlockedByCount * 12 + (missing.length === 0 ? 20 : 0)),
    );
    const message =
      missing.length === 0
        ? `You have ${unlockedByCount} ${SLOT_LABEL[rule.anchor]} but no ${slotLabel} — unlock more outfits`
        : `Need ${prettySuggestion} for ${unlockedByCount} ${SLOT_LABEL[rule.anchor]} (only ${missing.length} ${slotLabel})`;

    gaps.push({
      missingSlot: rule.missing,
      suggestion: prettySuggestion,
      unlockedByCount,
      anchorSlot: rule.anchor,
      colorHint,
      message,
      affiliateUrl: affiliateSuggestionUrl(prettySuggestion, merchant),
      priority,
    });
  }

  // Color-specific: many tops share a color with zero bottoms of that color
  const tops = bySlot.get("top") ?? [];
  const bottoms = bySlot.get("bottom") ?? [];
  if (tops.length >= 2) {
    const colorCounts = new Map<string, number>();
    for (const t of tops) {
      for (const c of t.colors ?? []) {
        const key = c.toLowerCase().trim();
        if (key) colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
      }
    }
    for (const [color, n] of colorCounts) {
      if (n < 2) continue;
      const matchingBottoms = bottoms.filter((b) =>
        (b.colors ?? []).some((c) => c.toLowerCase() === color),
      );
      if (matchingBottoms.length > 0) continue;
      const suggestion = `${color} trousers`;
      // Avoid duplicating an identical gap already added
      if (gaps.some((g) => g.suggestion === suggestion)) continue;
      gaps.push({
        missingSlot: "bottom",
        suggestion,
        unlockedByCount: n,
        anchorSlot: "top",
        colorHint: color,
        message: `Need ${suggestion} for ${n} tops`,
        affiliateUrl: affiliateSuggestionUrl(suggestion, merchant),
        priority: Math.min(100, 40 + n * 15),
      });
    }
  }

  gaps.sort((a, b) => b.priority - a.priority || b.unlockedByCount - a.unlockedByCount);
  const sliced = gaps.slice(0, limit);
  const summary =
    sliced.length === 0
      ? "Closet looks balanced — no strong missing-piece gaps."
      : `${sliced.length} gap(s): top suggestion “${sliced[0]!.suggestion}”.`;

  return { gaps: sliced, summary };
}
