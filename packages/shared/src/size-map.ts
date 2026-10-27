/**
 * N17 — Size inconsistency map per brand from return size outcomes.
 */

export const SIZE_RETURN_REASONS = [
  "TOO_SMALL",
  "TOO_BIG",
  "SIZE_TOO_SMALL",
  "SIZE_TOO_BIG",
  "WRONG_ITEM",
  "QUALITY",
  "OTHER",
] as const;

export type SizeReturnReason = (typeof SIZE_RETURN_REASONS)[number];

/** U016 — size tip / size-map only for fit size reasons (SIZE_* family). */
export const SIZE_FIT_REASONS = [
  "TOO_SMALL",
  "TOO_BIG",
  "SIZE_TOO_SMALL",
  "SIZE_TOO_BIG",
] as const;

export type SizeFitReason = (typeof SIZE_FIT_REASONS)[number];

export type SizeMapHistoryEntry = {
  returnId: string;
  brand: string;
  merchant: string | null;
  itemTitle: string | null;
  category: string | null;
  orderedSize: string | null;
  preferredSize: string | null;
  reason: SizeReturnReason;
  returnedAt: string;
};

export type SizeMapBrandRow = {
  brand: string;
  sampleCount: number;
  outcomes: {
    tooSmall: number;
    tooBig: number;
    keptOrOther: number;
  };
  /** Suggested size step vs ordered: +1 size up, -1 size down, 0 mixed/neutral. */
  suggestedDelta: -1 | 0 | 1 | null;
  history: SizeMapHistoryEntry[];
};

export type SizeMapAggregateInput = {
  returnId: string;
  brand?: string | null;
  merchant?: string | null;
  itemTitle?: string | null;
  category?: string | null;
  orderedSize?: string | null;
  preferredSize?: string | null;
  reason?: string | null;
  returnedAt: string | Date;
};

function normalizeBrand(brand: string | null | undefined, merchant: string | null | undefined): string {
  const b = (brand ?? "").trim();
  if (b) return b;
  const m = (merchant ?? "").trim();
  if (m) return m;
  return "Unknown";
}

export function isSizeReturnReason(value: string | null | undefined): value is SizeReturnReason {
  return Boolean(value && (SIZE_RETURN_REASONS as readonly string[]).includes(value));
}

/** U016 — true when reason is a size-fit code (SIZE_* / TOO_SMALL / TOO_BIG). */
export function isSizeFitReason(value: string | null | undefined): value is SizeFitReason {
  return Boolean(value && (SIZE_FIT_REASONS as readonly string[]).includes(value));
}

/** Infer size delta from reason and optional preferred vs ordered labels. */
export function sizeDeltaForEntry(input: {
  reason: SizeReturnReason;
  orderedSize?: string | null;
  preferredSize?: string | null;
}): -1 | 0 | 1 | null {
  if (input.reason === "TOO_SMALL" || input.reason === "SIZE_TOO_SMALL") return 1;
  if (input.reason === "TOO_BIG" || input.reason === "SIZE_TOO_BIG") return -1;
  const ordered = (input.orderedSize ?? "").trim().toUpperCase();
  const preferred = (input.preferredSize ?? "").trim().toUpperCase();
  if (ordered && preferred && ordered !== preferred) {
    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
    const oi = order.indexOf(ordered);
    const pi = order.indexOf(preferred);
    if (oi >= 0 && pi >= 0 && oi !== pi) return pi > oi ? 1 : -1;
  }
  return null;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Aggregate per-brand size history from returns that carry a size-related reason.
 * Non-size reasons still count toward keptOrOther when present.
 */
export function aggregateBrandSizeMap(entries: SizeMapAggregateInput[]): SizeMapBrandRow[] {
  const byBrand = new Map<
    string,
    {
      tooSmall: number;
      tooBig: number;
      keptOrOther: number;
      deltas: Array<-1 | 0 | 1>;
      history: SizeMapHistoryEntry[];
    }
  >();

  for (const e of entries) {
    if (!isSizeReturnReason(e.reason)) continue;
    const brand = normalizeBrand(e.brand, e.merchant);
    const bucket = byBrand.get(brand) ?? {
      tooSmall: 0,
      tooBig: 0,
      keptOrOther: 0,
      deltas: [],
      history: [],
    };

    if (e.reason === "TOO_SMALL" || e.reason === "SIZE_TOO_SMALL") bucket.tooSmall += 1;
    else if (e.reason === "TOO_BIG" || e.reason === "SIZE_TOO_BIG") bucket.tooBig += 1;
    else bucket.keptOrOther += 1;

    const delta = sizeDeltaForEntry({
      reason: e.reason,
      orderedSize: e.orderedSize,
      preferredSize: e.preferredSize,
    });
    if (delta === -1 || delta === 1) bucket.deltas.push(delta);

    bucket.history.push({
      returnId: e.returnId,
      brand,
      merchant: e.merchant ?? null,
      itemTitle: e.itemTitle ?? null,
      category: e.category ?? null,
      orderedSize: e.orderedSize ?? null,
      preferredSize: e.preferredSize ?? null,
      reason: e.reason,
      returnedAt: toIso(e.returnedAt),
    });

    byBrand.set(brand, bucket);
  }

  const rows: SizeMapBrandRow[] = [];
  for (const [brand, b] of byBrand) {
    const sampleCount = b.tooSmall + b.tooBig + b.keptOrOther;
    let suggestedDelta: -1 | 0 | 1 | null = null;
    if (b.deltas.length > 0) {
      const sum = b.deltas.reduce<number>((a, d) => a + d, 0);
      if (sum > 0) suggestedDelta = 1;
      else if (sum < 0) suggestedDelta = -1;
      else suggestedDelta = 0;
    }
    // TOO_SMALL / TOO_BIG always contribute ±1 deltas; empty deltas ⇒ keptOrOther-only.

    b.history.sort((a, c) => Date.parse(c.returnedAt) - Date.parse(a.returnedAt));
    rows.push({
      brand,
      sampleCount,
      outcomes: {
        tooSmall: b.tooSmall,
        tooBig: b.tooBig,
        keptOrOther: b.keptOrOther,
      },
      suggestedDelta,
      history: b.history,
    });
  }

  return rows.sort((a, b) => b.sampleCount - a.sampleCount || a.brand.localeCompare(b.brand));
}

/** W036 — dismissible “buy this size next” tip from brand aggregate. */
export type SizeMapTip = {
  brand: string;
  headline: string;
  body: string;
  dismissKey: string;
  suggestedSize: string | null;
  suggestedDelta: -1 | 0 | 1 | null;
};

const SIZE_LADDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"] as const;

function stepSizeLabel(ordered: string, delta: -1 | 1): string | null {
  const key = ordered.trim().toUpperCase();
  const idx = (SIZE_LADDER as readonly string[]).indexOf(key);
  if (idx < 0) return null;
  const next = SIZE_LADDER[idx + delta];
  return next ?? null;
}

/**
 * Tip copy from a brand size-map row (+ optional ordered size on this return).
 * Returns null when there is nothing actionable to show.
 */
export function buildSizeMapTip(input: {
  brand: string;
  suggestedDelta: -1 | 0 | 1 | null;
  sampleCount: number;
  orderedSize?: string | null;
  preferredSize?: string | null;
}): SizeMapTip | null {
  const brand = input.brand.trim() || "this brand";
  if (input.sampleCount < 1) return null;

  const preferred = (input.preferredSize ?? "").trim();
  const ordered = (input.orderedSize ?? "").trim();
  const delta = input.suggestedDelta;

  let suggestedSize: string | null = preferred || null;
  if (!suggestedSize && ordered && (delta === 1 || delta === -1)) {
    suggestedSize = stepSizeLabel(ordered, delta);
  }

  if (preferred) {
    return {
      brand,
      headline: `Buy ${preferred} next at ${brand}`,
      body: `From your size map (${input.sampleCount} return${input.sampleCount === 1 ? "" : "s"}) — prefer ${preferred} next time.`,
      dismissKey: `size-map-tip:${brand.toLowerCase()}`,
      suggestedSize: preferred,
      suggestedDelta: delta,
    };
  }

  if (delta === 1) {
    const sizeBit = suggestedSize ? ` — try ${suggestedSize}` : ordered ? ` from ${ordered}` : "";
    return {
      brand,
      headline: `${brand} runs small`,
      body: `Size up next${sizeBit}. Based on ${input.sampleCount} fit return${input.sampleCount === 1 ? "" : "s"}.`,
      dismissKey: `size-map-tip:${brand.toLowerCase()}`,
      suggestedSize,
      suggestedDelta: 1,
    };
  }

  if (delta === -1) {
    const sizeBit = suggestedSize ? ` — try ${suggestedSize}` : ordered ? ` from ${ordered}` : "";
    return {
      brand,
      headline: `${brand} runs large`,
      body: `Size down next${sizeBit}. Based on ${input.sampleCount} fit return${input.sampleCount === 1 ? "" : "s"}.`,
      dismissKey: `size-map-tip:${brand.toLowerCase()}`,
      suggestedSize,
      suggestedDelta: -1,
    };
  }

  return null;
}

/** Pick the best tip for a merchant/brand from size-map brands list. */
export function sizeMapTipForBrand(
  brands: SizeMapBrandRow[],
  brandOrMerchant: string | null | undefined,
  opts?: {
    orderedSize?: string | null;
    preferredSize?: string | null;
    /** U016 — when set, tip only if this return reason is SIZE_* / fit. */
    reason?: string | null;
  },
): SizeMapTip | null {
  if (opts?.reason && !isSizeFitReason(opts.reason)) return null;
  const key = (brandOrMerchant ?? "").trim().toLowerCase();
  if (!key || brands.length === 0) return null;
  const row =
    brands.find((b) => b.brand.toLowerCase() === key) ??
    brands.find(
      (b) =>
        b.brand.toLowerCase().includes(key) || key.includes(b.brand.toLowerCase()),
    );
  if (!row) return null;
  return buildSizeMapTip({
    brand: row.brand,
    suggestedDelta: row.suggestedDelta,
    sampleCount: row.sampleCount,
    orderedSize: opts?.orderedSize ?? row.history[0]?.orderedSize,
    preferredSize: opts?.preferredSize ?? row.history[0]?.preferredSize,
  });
}
