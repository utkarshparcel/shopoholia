/**
 * W075 — inline fix-parse helpers (merchant + total on the activity row).
 */

export type ParseMajorTotalResult =
  | { ok: true; totalMinor: number }
  | { ok: false; error: string };

/** Parse user-entered major units (e.g. 499.00) into minor units. */
export function parseMajorTotal(input: string): ParseMajorTotalResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a valid total (major units, e.g. 499.00).' };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'Enter a valid total (major units, e.g. 499.00).' };
  }
  return { ok: true, totalMinor: Math.round(n * 100) };
}

export type InlineFixDraft = {
  merchant: string;
  totalMajor: string;
  currency: string;
};

export function draftFromActivityItem(item: {
  merchant?: string | null;
  totalMinor?: number | null;
  currency?: string | null;
}): InlineFixDraft {
  return {
    merchant: item.merchant?.trim() ?? '',
    totalMajor: item.totalMinor != null ? (item.totalMinor / 100).toFixed(2) : '',
    currency: item.currency ?? 'INR',
  };
}

export type InlineFixBody = {
  merchant?: string;
  totalMinor: number;
  currency: string;
};

export type BuildInlineFixResult =
  | { ok: true; body: InlineFixBody }
  | { ok: false; error: string };

export function buildInlineFixBody(draft: InlineFixDraft): BuildInlineFixResult {
  const parsed = parseMajorTotal(draft.totalMajor);
  if (!parsed.ok) return parsed;
  const merchant = draft.merchant.trim();
  return {
    ok: true,
    body: {
      merchant: merchant || undefined,
      totalMinor: parsed.totalMinor,
      currency: draft.currency || 'INR',
    },
  };
}
