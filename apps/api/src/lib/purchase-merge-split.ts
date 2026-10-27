import type {
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
  Repositories,
} from "./repositories/types.js";

export class PurchaseMergeSplitError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "PurchaseMergeSplitError";
  }
}

/** Line total in minor units (price × qty). */
export function lineMinor(item: {
  priceMinor: number;
  qty: number;
}): number {
  return item.priceMinor * item.qty;
}

/** Sum of line totals — source of truth for purchase.totalMinor after merge/split. */
export function sumItemsMinor(
  items: Array<{ priceMinor: number; qty: number }>,
): number {
  return items.reduce((acc, it) => acc + lineMinor(it), 0);
}

export function assertPurchasesMergeable(
  target: MerchantPurchaseRecord,
  source: MerchantPurchaseRecord,
  userId: string,
): void {
  if (target.userId !== userId || source.userId !== userId) {
    throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
  }
  if (target.id === source.id) {
    throw new PurchaseMergeSplitError(
      "BAD_REQUEST",
      "Cannot merge a purchase into itself",
    );
  }
  if (target.status === "DUPLICATE" || source.status === "DUPLICATE") {
    throw new PurchaseMergeSplitError(
      "CONFLICT",
      "Cannot merge a purchase marked DUPLICATE",
    );
  }
  if (target.currency !== source.currency) {
    throw new PurchaseMergeSplitError(
      "CONFLICT",
      "Purchases must share the same currency to merge",
    );
  }
}

/** Everything a merge checks, on the rows the repository has locked. */
export function assertMergePlan(
  target: MerchantPurchaseRecord,
  source: MerchantPurchaseRecord,
  sourceItemCount: number,
  userId: string,
): void {
  assertPurchasesMergeable(target, source, userId);
  if (sourceItemCount === 0 && source.totalMinor === 0) {
    throw new PurchaseMergeSplitError(
      "CONFLICT",
      "Source purchase has nothing to merge",
    );
  }
}

export function assertItemsSplitable(
  purchase: MerchantPurchaseRecord,
  items: MerchantPurchaseItemRecord[],
  itemIds: string[],
  userId: string,
): MerchantPurchaseItemRecord[] {
  if (purchase.userId !== userId) {
    throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
  }
  if (purchase.status === "DUPLICATE") {
    throw new PurchaseMergeSplitError(
      "CONFLICT",
      "Cannot split a purchase marked DUPLICATE",
    );
  }
  const byId = new Map(items.map((it) => [it.id, it]));
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length !== itemIds.length) {
    throw new PurchaseMergeSplitError("BAD_REQUEST", "Duplicate itemIds");
  }
  const moving: MerchantPurchaseItemRecord[] = [];
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row || row.purchaseId !== purchase.id) {
      throw new PurchaseMergeSplitError(
        "BAD_REQUEST",
        "itemIds must belong to the purchase",
      );
    }
    moving.push(row);
  }
  if (moving.length === 0) {
    throw new PurchaseMergeSplitError("BAD_REQUEST", "Select at least one item");
  }
  if (moving.length >= items.length) {
    throw new PurchaseMergeSplitError(
      "BAD_REQUEST",
      "Keep at least one item on the original purchase",
    );
  }
  return moving;
}

/**
 * Merge `source` into `target`: move items (preserving ids), recompute totals,
 * mark source DUPLICATE, repoint docs/receipts/returns — in one transaction, so a
 * crash can never leave lines counted under both purchases.
 */
export async function mergePurchases(
  repos: Repositories,
  userId: string,
  input: { targetPurchaseId: string; sourcePurchaseId: string },
): Promise<{
  purchase: MerchantPurchaseRecord;
  items: MerchantPurchaseItemRecord[];
  mergedFromId: string;
}> {
  try {
    const { purchase, items } = await repos.mergeMerchantPurchases(
      userId,
      input.targetPurchaseId,
      input.sourcePurchaseId,
    );
    return { purchase, items, mergedFromId: input.sourcePurchaseId };
  } catch (err) {
    // Both purchases have an open whole-order return (one open return per line, #61).
    if ((err as { code?: string })?.code === "23505") {
      throw new PurchaseMergeSplitError(
        "CONFLICT",
        "Both purchases have an open return; finish or cancel one first",
      );
    }
    throw err;
  }
}

/**
 * Split selected items onto a new purchase (same merchant/currency/source).
 * Item ids are preserved via move. One transaction.
 */
export async function splitPurchase(
  repos: Repositories,
  userId: string,
  input: { purchaseId: string; itemIds: string[]; merchant?: string },
): Promise<{
  original: { purchase: MerchantPurchaseRecord; items: MerchantPurchaseItemRecord[] };
  split: { purchase: MerchantPurchaseRecord; items: MerchantPurchaseItemRecord[] };
}> {
  return repos.splitMerchantPurchase(userId, input);
}
