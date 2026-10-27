/**
 * WV04-AUTOTAG — light vision/filename heuristics for category / color / brand
 * plus near-duplicate warnings against the existing closet.
 */

import {
  findDuplicateWarnings,
  type CandidateLike,
  type DuplicateWarningResult,
  type OwnedItemLike,
} from "./dup-rebuy.js";

/** Known color tokens (lowercase) → display color. */
export const AUTOTAG_COLORS: Record<string, string> = {
  black: "black",
  white: "white",
  navy: "navy",
  blue: "blue",
  red: "red",
  green: "green",
  beige: "beige",
  cream: "cream",
  grey: "grey",
  gray: "grey",
  brown: "brown",
  pink: "pink",
  purple: "purple",
  yellow: "yellow",
  orange: "orange",
  olive: "olive",
  maroon: "maroon",
  khaki: "khaki",
};

/** Category keyword → canonical category slug. */
export const AUTOTAG_CATEGORIES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(t-?shirt|tee)\b/i, category: "tshirt" },
  { pattern: /\b(shirt|button[- ]?down)\b/i, category: "shirt" },
  { pattern: /\b(jeans|denim)\b/i, category: "jeans" },
  { pattern: /\b(trouser|pants|chinos)\b/i, category: "trousers" },
  { pattern: /\b(sneakers?|trainers?|shoes?|boots?)\b/i, category: "sneakers" },
  { pattern: /\b(kurta|kurti)\b/i, category: "kurta" },
  { pattern: /\b(saree|sari)\b/i, category: "saree" },
  { pattern: /\b(dress|gown)\b/i, category: "dress" },
  { pattern: /\b(jacket|blazer|coat)\b/i, category: "jacket" },
  { pattern: /\b(hoodie|sweatshirt)\b/i, category: "hoodie" },
  { pattern: /\b(skirt)\b/i, category: "skirt" },
  { pattern: /\b(short)\b/i, category: "shorts" },
  { pattern: /\b(bag|tote|handbag)\b/i, category: "bag" },
  { pattern: /\b(belt)\b/i, category: "belt" },
];

const BRAND_HINTS = [
  "zara",
  "uniqlo",
  "nike",
  "adidas",
  "h&m",
  "hm",
  "myntra",
  "levis",
  "levi's",
  "gap",
  "puma",
  "fabindia",
  "mango",
  "forever21",
];

export type VisionAutoTag = {
  category: string;
  colors: string[];
  brand: string | null;
  confidence: number;
  /** Tokens / labels the tagger used (debug + tests). */
  sourceLabels: string[];
};

export type AutoTagWithDupes = VisionAutoTag & {
  duplicateWarnings: DuplicateWarningResult[];
};

/** Normalize an image key / path / OCR blob into searchable tokens. */
export function labelsFromImageKey(imageKey: string): string[] {
  const base = imageKey.split(/[/\\]/).pop() ?? imageKey;
  const stem = base.replace(/\.[a-z0-9]+$/i, "");
  return stem
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Heuristic tag from filename / vision label list (no network).
 * Prefer explicit `labels` when provided (vision API); else parse `imageKey`.
 */
export function inferWardrobeAutoTag(input: {
  imageKey?: string | null;
  labels?: string[];
  /** Optional freeform OCR / caption text. */
  text?: string | null;
}): VisionAutoTag {
  const fromKey = input.imageKey ? labelsFromImageKey(input.imageKey) : [];
  const fromLabels = (input.labels ?? []).flatMap((l) =>
    l
      .toLowerCase()
      .split(/[\s,/|]+/)
      .filter((t) => t.length >= 2),
  );
  const fromText = (input.text ?? "")
    .toLowerCase()
    .split(/[\s,/|]+/)
    .filter((t) => t.length >= 2);
  const sourceLabels = [...new Set([...fromLabels, ...fromKey, ...fromText])];
  const haystack = sourceLabels.join(" ");

  let category = "other";
  let categoryHit = false;
  for (const { pattern, category: cat } of AUTOTAG_CATEGORIES) {
    if (pattern.test(haystack)) {
      category = cat;
      categoryHit = true;
      break;
    }
  }

  const colors: string[] = [];
  for (const tok of sourceLabels) {
    const c = AUTOTAG_COLORS[tok];
    if (c && !colors.includes(c)) colors.push(c);
  }

  let brand: string | null = null;
  for (const hint of BRAND_HINTS) {
    if (haystack.includes(hint.replace("'", ""))) {
      brand = hint === "hm" || hint === "h&m" ? "H&M" : capitalizeBrand(hint);
      break;
    }
  }
  // Title-case unknown token before category when it looks like a brand (length ≥3, not a color/cat)
  if (!brand) {
    for (const tok of sourceLabels) {
      if (AUTOTAG_COLORS[tok]) continue;
      if (AUTOTAG_CATEGORIES.some((c) => c.pattern.test(tok))) continue;
      if (tok.length >= 3 && /^[a-z]+$/.test(tok) && !["other", "image", "photo", "img", "wardrobe"].includes(tok)) {
        brand = capitalizeBrand(tok);
        break;
      }
    }
  }

  let confidence = 0.35;
  if (categoryHit) confidence += 0.25;
  if (colors.length > 0) confidence += 0.2;
  if (brand) confidence += 0.15;
  confidence = Math.min(0.95, Math.round(confidence * 100) / 100);

  return { category, colors, brand, confidence, sourceLabels };
}

function capitalizeBrand(s: string): string {
  if (s === "levis" || s === "levi's") return "Levi's";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Auto-tag + near-duplicate warn against owned wardrobe items.
 */
export function autoTagWithDuplicateCheck(
  input: {
    imageKey?: string | null;
    labels?: string[];
    text?: string | null;
    titleHint?: string | null;
  },
  owned: OwnedItemLike[],
  threshold = 0.55,
): AutoTagWithDupes {
  const tag = inferWardrobeAutoTag(input);
  const candidate: CandidateLike = {
    title: input.titleHint?.trim() || [tag.brand, tag.colors[0], tag.category].filter(Boolean).join(" "),
    brand: tag.brand,
  };
  const duplicateWarnings = findDuplicateWarnings([candidate], owned, threshold);
  return { ...tag, duplicateWarnings };
}
