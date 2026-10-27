import { normalizeGstin, readReceiptGstin } from "./gstin.js";

export type ReceiptSearchQuery = {
  merchant?: string;
  /** Inclusive lower bound (ISO datetime or YYYY-MM-DD). */
  from?: string;
  /** Inclusive upper bound (ISO datetime or YYYY-MM-DD). */
  to?: string;
  gstin?: string;
};

export type ReceiptSearchable = {
  merchant: string;
  purchasedAt: string | Date;
  gstin?: string | null;
  ocrJson?: Record<string, unknown> | null;
};

function toTime(value: string | Date): number {
  if (value instanceof Date) return value.getTime();
  // Date-only → start of UTC day
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T00:00:00.000Z`);
  }
  return Date.parse(value);
}

function toEndTime(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T23:59:59.999Z`);
  }
  return Date.parse(value);
}

/**
 * Pure filter for GST / invoice archive search (N18).
 * Merchant = case-insensitive contains; GSTIN = normalized equality / contains;
 * dates inclusive on purchasedAt.
 */
export function filterReceiptsForSearch<T extends ReceiptSearchable>(
  receipts: T[],
  query: ReceiptSearchQuery,
): T[] {
  const merchantQ = query.merchant?.trim().toLowerCase();
  const gstinQ = query.gstin ? normalizeGstin(query.gstin) : "";
  const fromMs = query.from ? toTime(query.from) : null;
  const toMs = query.to ? toEndTime(query.to) : null;

  return receipts.filter((r) => {
    if (merchantQ && !r.merchant.toLowerCase().includes(merchantQ)) {
      return false;
    }
    const purchasedMs = toTime(r.purchasedAt);
    if (fromMs != null && !Number.isNaN(fromMs) && purchasedMs < fromMs) {
      return false;
    }
    if (toMs != null && !Number.isNaN(toMs) && purchasedMs > toMs) {
      return false;
    }
    if (gstinQ) {
      const g = readReceiptGstin(r);
      if (!g || !g.includes(gstinQ)) return false;
    }
    return true;
  });
}
