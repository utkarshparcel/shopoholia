/**
 * U042 — Unknown merchant queue: pick canonical merchant or create alias,
 * then reprocess return/exchange window fields on linked purchases.
 */

import {
  computeExchangeWindowDeadline,
  computeReturnWindowDeadline,
} from "@worn/shared";
import type { Repositories } from "./repositories/types.js";

type AliasRepos = Pick<Repositories, "upsertMerchantAlias" | "listMerchantAliases">;

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

/** The user's aliases (stored in `merchant_aliases`), by alias. */
export async function listMerchantAliases(repos: AliasRepos, userId: string): Promise<MerchantAlias[]> {
  const rows = await repos.listMerchantAliases(userId);
  return rows.map((r) => ({ alias: r.alias, canonical: r.canonical, createdAt: r.createdAt.toISOString() }));
}

export async function upsertMerchantAlias(
  repos: AliasRepos,
  userId: string,
  alias: string,
  canonical: string,
): Promise<MerchantAlias> {
  const key = normalizeMerchantKey(alias);
  const canon = canonical.trim();
  if (!key || !canon) {
    throw new Error("alias and canonical are required");
  }
  const row = await repos.upsertMerchantAlias(userId, key, canon);
  return { alias: row.alias, canonical: row.canonical, createdAt: row.createdAt.toISOString() };
}

export async function resolveMerchantAlias(
  repos: AliasRepos,
  userId: string,
  merchant: string | null | undefined,
): Promise<string | null> {
  if (!merchant?.trim()) return null;
  const key = normalizeMerchantKey(merchant);
  const hit = (await repos.listMerchantAliases(userId)).find((a) => a.alias === key);
  return hit?.canonical ?? merchant.trim();
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

export async function merchantPickerOptions(
  repos: AliasRepos,
  userId: string,
  extras: string[] = [],
): Promise<string[]> {
  const aliases = (await repos.listMerchantAliases(userId)).map((a) => a.canonical);
  const set = new Set<string>([
    ...CANONICAL_MERCHANT_PICKS,
    ...aliases,
    ...extras.map((e) => e.trim()).filter(Boolean),
  ]);
  return [...set].sort((a, b) => a.localeCompare(b));
}
