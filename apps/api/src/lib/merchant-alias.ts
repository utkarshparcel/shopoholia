/**
 * U042 — Unknown merchant queue: pick canonical merchant or create alias,
 * then reprocess return/exchange window fields on linked purchases.
 */

import {
  computeExchangeWindowDeadline,
  computeReturnWindowDeadline,
} from "@worn/shared";

export type MerchantAlias = {
  alias: string;
  canonical: string;
  createdAt: string;
};

export type UnknownMerchantQueueItem = {
  documentId: string;
  kind: string;
  rawMerchant: string | null;
  matchedPurchaseId: string | null;
  createdAt: string;
};

const UNKNOWN_LABELS = new Set([
  "",
  "UNKNOWN",
  "UNKNOWN MERCHANT",
  "N/A",
  "NA",
  "NULL",
]);

/** Case-fold + trim for alias keys. */
export function normalizeMerchantKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

export function isUnknownMerchant(merchant: string | null | undefined): boolean {
  if (merchant == null) return true;
  const key = normalizeMerchantKey(merchant);
  return UNKNOWN_LABELS.has(key) || key.length === 0;
}

/** In-memory per-user alias map (tests + memory repo path). */
const aliasesByUser = new Map<string, Map<string, MerchantAlias>>();

export function listMerchantAliases(userId: string): MerchantAlias[] {
  const m = aliasesByUser.get(userId);
  if (!m) return [];
  return [...m.values()].sort((a, b) => a.alias.localeCompare(b.alias));
}

export function upsertMerchantAlias(
  userId: string,
  alias: string,
  canonical: string,
): MerchantAlias {
  const key = normalizeMerchantKey(alias);
  const canon = canonical.trim();
  if (!key || !canon) {
    throw new Error("alias and canonical are required");
  }
  let map = aliasesByUser.get(userId);
  if (!map) {
    map = new Map();
    aliasesByUser.set(userId, map);
  }
  const row: MerchantAlias = {
    alias: key,
    canonical: canon,
    createdAt: new Date().toISOString(),
  };
  map.set(key, row);
  return row;
}

export function resolveMerchantAlias(
  userId: string,
  merchant: string | null | undefined,
): string | null {
  if (!merchant?.trim()) return null;
  const key = normalizeMerchantKey(merchant);
  const hit = aliasesByUser.get(userId)?.get(key);
  return hit?.canonical ?? merchant.trim();
}

export function clearMerchantAliases(userId?: string): void {
  if (userId) aliasesByUser.delete(userId);
  else aliasesByUser.clear();
}

export function buildUnknownMerchantQueue(
  docs: Array<{
    id: string;
    kind: string;
    parsedJson: Record<string, unknown> | null;
    matchedPurchaseId: string | null;
    createdAt: Date;
  }>,
): UnknownMerchantQueueItem[] {
  const out: UnknownMerchantQueueItem[] = [];
  for (const d of docs) {
    const raw =
      typeof d.parsedJson?.merchant === "string"
        ? d.parsedJson.merchant
        : null;
    if (!isUnknownMerchant(raw)) continue;
    out.push({
      documentId: d.id,
      kind: d.kind,
      rawMerchant: raw,
      matchedPurchaseId: d.matchedPurchaseId,
      createdAt: d.createdAt.toISOString(),
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Recompute return/exchange windows for a purchase after merchant resolve. */
export function reprocessWindowFields(input: {
  purchasedAt: Date;
  merchant: string;
}): {
  returnWindowDeadline: Date;
  exchangeWindowDeadline: Date;
} {
  return {
    returnWindowDeadline: computeReturnWindowDeadline(
      input.purchasedAt,
      input.merchant,
    ),
    exchangeWindowDeadline: computeExchangeWindowDeadline(
      input.purchasedAt,
      input.merchant,
    ),
  };
}

/** Canonical merchant picker options (shared known brands + user aliases). */
export const CANONICAL_MERCHANT_PICKS = [
  "Amazon",
  "Flipkart",
  "Myntra",
  "Ajio",
  "Nykaa",
  "Meesho",
  "Target",
  "Walmart",
  "Nike",
  "Zara",
] as const;

export function merchantPickerOptions(
  userId: string,
  extras: string[] = [],
): string[] {
  const aliases = listMerchantAliases(userId).map((a) => a.canonical);
  const set = new Set<string>([
    ...CANONICAL_MERCHANT_PICKS,
    ...aliases,
    ...extras.map((e) => e.trim()).filter(Boolean),
  ]);
  return [...set].sort((a, b) => a.localeCompare(b));
}
