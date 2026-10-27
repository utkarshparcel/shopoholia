/**
 * W060 — Autotag confirm/edit before save (soft duplicate warn).
 */

export type AutotagConfirmDraft = {
  imageUri: string;
  category: string;
  colors: string[];
  brand: string | null;
  confidence: number;
  duplicateWarnings: Array<{ wardrobeItemId?: string; score?: number; reason?: string }>;
};

export type AutotagConfirmView = {
  category: string;
  colorsLabel: string;
  brand: string;
  softDupWarn: string | null;
  canSave: boolean;
};

/** Soft (non-blocking) duplicate copy for confirm sheet. */
export function softDuplicateWarnCopy(
  warnings: AutotagConfirmDraft["duplicateWarnings"] | null | undefined,
): string | null {
  if (!warnings?.length) return null;
  return "Might already be in your closet — you can still save.";
}

export function buildAutotagConfirmView(draft: AutotagConfirmDraft): AutotagConfirmView {
  const category = draft.category.trim() || "other";
  const colors = draft.colors.map((c) => c.trim()).filter(Boolean);
  return {
    category,
    colorsLabel: colors.length ? colors.join(", ") : "no colors",
    brand: (draft.brand ?? "").trim() || "—",
    softDupWarn: softDuplicateWarnCopy(draft.duplicateWarnings),
    canSave: category.length > 0,
  };
}

/** Apply user edits before save. */
export function applyAutotagEdits(
  draft: AutotagConfirmDraft,
  edits: { category?: string; colors?: string[]; brand?: string | null },
): AutotagConfirmDraft {
  return {
    ...draft,
    category: edits.category !== undefined ? edits.category.trim() || "other" : draft.category,
    colors: edits.colors !== undefined ? edits.colors.map((c) => c.trim()).filter(Boolean) : draft.colors,
    brand:
      edits.brand !== undefined
        ? edits.brand?.trim()
          ? edits.brand.trim()
          : null
        : draft.brand,
  };
}
