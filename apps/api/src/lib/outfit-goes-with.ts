/**
 * “What goes with this?” — category pairing + color harmony ranking
 * over the user's owned wardrobe.
 */

export type GarmentSlot =
  | "top"
  | "bottom"
  | "shoes"
  | "outer"
  | "dress"
  | "accessory"
  | "other";

export type GoesWithCandidate = {
  id: string;
  category: string;
  colors?: string[] | null;
  brand?: string | null;
};

export type GoesWithMatch = GoesWithCandidate & {
  score: number;
  slot: GarmentSlot;
  reasons: string[];
};

const TOP_RE = /\b(shirt|tee|t-shirt|top|blouse|kurta|polo|sweater|hoodie|camisole|tank)\b/i;
const BOTTOM_RE = /\b(jeans|pants|trousers|shorts|skirt|chinos|joggers|palazzo|leggings)\b/i;
const SHOES_RE =
  /\b(shoes?|sneakers?|boots?|sandals?|loafers?|heels?|slippers?|chukkas?)\b/i;
const OUTER_RE = /\b(jacket|coat|blazer|hoodie|cardigan|layer|rain|parka|vest)\b/i;
const DRESS_RE = /\b(dress|saree|sari|gown|jumpsuit|romper|lehenga)\b/i;
const ACCESSORY_RE =
  /\b(belt|scarf|hat|bag|watch|jewelry|jewellery|tie|cap|necklace|earrings?|bracelet|bangle|ring|pendant)\b/i;

/** Map a free-text category onto a garment slot for pairing rules. */
export function categorySlot(category: string): GarmentSlot {
  const c = category.trim();
  if (DRESS_RE.test(c)) return "dress";
  if (SHOES_RE.test(c)) return "shoes";
  if (OUTER_RE.test(c) && !TOP_RE.test(c)) return "outer";
  if (BOTTOM_RE.test(c)) return "bottom";
  if (TOP_RE.test(c)) return "top";
  if (ACCESSORY_RE.test(c)) return "accessory";
  // Outerwear that also matches top keywords (e.g. "hoodie") prefers outer when alone
  if (OUTER_RE.test(c)) return "outer";
  return "other";
}

/** Compatible companion slots for an anchor piece. */
export function companionSlots(anchor: GarmentSlot): GarmentSlot[] {
  switch (anchor) {
    case "top":
      return ["bottom", "shoes", "outer", "accessory"];
    case "bottom":
      return ["top", "shoes", "outer", "accessory"];
    case "shoes":
      return ["top", "bottom", "dress", "outer"];
    case "outer":
      return ["top", "bottom", "shoes", "dress"];
    case "dress":
      return ["shoes", "outer", "accessory"];
    case "accessory":
      return ["top", "bottom", "dress", "shoes", "outer"];
    default:
      return ["top", "bottom", "shoes", "outer", "dress", "accessory"];
  }
}

const NEUTRALS = new Set(["black", "white", "grey", "gray", "beige", "navy", "cream", "ivory", "khaki", "tan"]);

function colorOverlap(a: string[], b: string[]): number {
  const as = new Set(a.map((c) => c.toLowerCase()));
  let n = 0;
  for (const c of b) if (as.has(c.toLowerCase())) n += 1;
  return n;
}

function hasNeutral(colors: string[]): boolean {
  return colors.some((c) => NEUTRALS.has(c.toLowerCase()));
}

/**
 * Score how well `candidate` pairs with `anchor`.
 * Higher is better. Returns 0 when slots are incompatible (same slot, etc.).
 */
export function goesWithScore(
  anchor: GoesWithCandidate,
  candidate: GoesWithCandidate,
): { score: number; reasons: string[]; slot: GarmentSlot } {
  const aSlot = categorySlot(anchor.category);
  const cSlot = categorySlot(candidate.category);
  const reasons: string[] = [];
  if (anchor.id === candidate.id) return { score: 0, reasons: [], slot: cSlot };

  const allowed = companionSlots(aSlot);
  if (!allowed.includes(cSlot) && cSlot !== "other" && aSlot !== "other") {
    return { score: 0, reasons: [], slot: cSlot };
  }

  let score = 10; // base for compatible slot
  reasons.push(`Pairs as ${cSlot} with your ${aSlot}`);

  // Prefer classic top↔bottom / dress↔shoes pairings
  if (
    (aSlot === "top" && cSlot === "bottom") ||
    (aSlot === "bottom" && cSlot === "top") ||
    (aSlot === "dress" && cSlot === "shoes") ||
    (aSlot === "shoes" && cSlot === "dress")
  ) {
    score += 8;
    reasons.push("Classic category match");
  }
  if (cSlot === "shoes") score += 3;
  if (cSlot === "outer") score += 2;

  const aColors = anchor.colors ?? [];
  const cColors = candidate.colors ?? [];
  const overlap = colorOverlap(aColors, cColors);
  if (overlap > 0) {
    score += overlap * 4;
    reasons.push("Shared color");
  } else if (hasNeutral(cColors) || hasNeutral(aColors)) {
    score += 3;
    reasons.push("Neutral color bridge");
  }

  if (anchor.brand && candidate.brand && anchor.brand.toLowerCase() === candidate.brand.toLowerCase()) {
    score += 1;
    reasons.push("Same brand");
  }

  return { score, reasons, slot: cSlot };
}

/** Rank owned wardrobe pieces that go with the anchor item. */
export function rankGoesWith(
  anchor: GoesWithCandidate,
  candidates: GoesWithCandidate[],
  opts?: { limit?: number },
): GoesWithMatch[] {
  const limit = opts?.limit ?? 20;
  const scored: GoesWithMatch[] = [];
  for (const c of candidates) {
    const { score, reasons, slot } = goesWithScore(anchor, c);
    if (score <= 0) continue;
    scored.push({ ...c, score, slot, reasons });
  }
  scored.sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  return scored.slice(0, limit);
}
