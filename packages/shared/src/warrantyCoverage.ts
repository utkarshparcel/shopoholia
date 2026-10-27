/**
 * Warranty category coverage presets (electronics / appliances / apparel).
 * Used when confirming receipts or auto-detecting coverage length.
 */

export const WARRANTY_CATEGORIES = [
  "electronics",
  "appliances",
  "apparel",
] as const;

export type WarrantyCategory = (typeof WARRANTY_CATEGORIES)[number];

export const WARRANTY_COVERAGE_PRESETS: Record<
  WarrantyCategory,
  { months: number; label: string }
> = {
  electronics: { months: 12, label: "Electronics" },
  appliances: { months: 24, label: "Appliances" },
  apparel: { months: 6, label: "Apparel" },
};

const ELECTRONICS_RE =
  /\b(phone|laptop|tablet|headphones?|earbuds?|camera|tvs?|console|watch|electronics)\b/i;
const APPLIANCES_RE =
  /\b(fridge|refrigerator|washer|dryer|microwave|oven|ac|air.?conditioner|appliance|dishwasher)\b/i;
const APPAREL_RE =
  /\b(shirt|tee|t-shirt|jeans|dress|kurta|saree|hoodie|jacket|apparel|pant|trouser|shoe|sneaker)\b/i;

/** Infer a warranty category from item title and optional OCR category hint. */
export function inferWarrantyCategory(
  title: string,
  categoryHint?: string | null,
): WarrantyCategory | null {
  const hint = (categoryHint ?? "").toLowerCase().trim();
  if ((WARRANTY_CATEGORIES as readonly string[]).includes(hint)) {
    return hint as WarrantyCategory;
  }
  if (hint.includes("electronic")) return "electronics";
  if (hint.includes("appliance")) return "appliances";
  if (hint.includes("apparel") || hint === "top" || hint === "bottom") {
    return "apparel";
  }

  const t = title.toLowerCase();
  if (ELECTRONICS_RE.test(t)) return "electronics";
  if (APPLIANCES_RE.test(t)) return "appliances";
  if (APPAREL_RE.test(t)) return "apparel";
  return null;
}

/** Coverage end date from purchase date + category preset (or explicit months). */
export function coverageUntilFromCategory(
  purchasedAt: Date | string,
  category: WarrantyCategory,
  monthsOverride?: number,
): Date {
  const months =
    monthsOverride ?? WARRANTY_COVERAGE_PRESETS[category].months;
  const start = new Date(purchasedAt).getTime();
  return new Date(start + months * 30 * 86_400_000);
}

export type WarrantyDraftFromRules = {
  itemIndex: number;
  category: WarrantyCategory;
  coverageUntil: Date;
  months: number;
};

/**
 * U010 — Draft warranties from merchant category rules (title / OCR category).
 * Presets are heuristics, not legal manufacturer coverage. User must edit before save.
 */
export function draftWarrantiesFromCategoryRules(
  items: Array<{ title: string; category?: string | null }>,
  purchasedAt: Date | string,
): WarrantyDraftFromRules[] {
  const out: WarrantyDraftFromRules[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const category = inferWarrantyCategory(item.title, item.category);
    if (!category) continue;
    const months = WARRANTY_COVERAGE_PRESETS[category].months;
    out.push({
      itemIndex: i,
      category,
      coverageUntil: coverageUntilFromCategory(purchasedAt, category),
      months,
    });
  }
  return out;
}
