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
 * mark source DUPLICATE, repoint docs/receipts/returns.
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
  const target = await repos.findMerchantPurchaseById(input.targetPurchaseId);
  const source = await repos.findMerchantPurchaseById(input.sourcePurchaseId);
  if (!target || !source) {
    throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
  }
  assertPurchasesMergeable(target, source, userId);

  const [targetItems, sourceItems] = await Promise.all([
    repos.listMerchantPurchaseItems(target.id),
    repos.listMerchantPurchaseItems(source.id),
  ]);

  if (sourceItems.length === 0 && source.totalMinor === 0) {
    throw new PurchaseMergeSplitError(
      "CONFLICT",
      "Source purchase has nothing to merge",
    );
  }

  const moved =
    sourceItems.length > 0
      ? await repos.moveMerchantPurchaseItems(
          sourceItems.map((i) => i.id),
          target.id,
        )
      : [];

  await repos.repointMerchantPurchaseRefs(source.id, target.id);

  const allItems = [...targetItems, ...moved];
  const totalMinor = sumItemsMinor(allItems);

  const patched = await repos.updateMerchantPurchase(target.id, { totalMinor });
  if (!patched) {
    throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
  }

  await repos.updateMerchantPurchase(source.id, {
    status: "DUPLICATE",
    totalMinor: 0,
  });

  const items = await repos.listMerchantPurchaseItems(target.id);
  // Integrity: totals must equal sum of lines
  if (sumItemsMinor(items) !== patched.totalMinor) {
    const healed = await repos.updateMerchantPurchase(target.id, {
      totalMinor: sumItemsMinor(items),
    });
    return {
      purchase: healed ?? patched,
      items,
      mergedFromId: source.id,
    };
  }

  return {
    purchase: patched,
    items,
    mergedFromId: source.id,
  };
}

/**
 * Split selected items onto a new purchase (same merchant/currency/source).
 * Item ids are preserved via move.
 */
export async function splitPurchase(
  repos: Repositories,
  userId: string,
  input: { purchaseId: string; itemIds: string[]; merchant?: string },
): Promise<{
  original: { purchase: MerchantPurchaseRecord; items: MerchantPurchaseItemRecord[] };
  split: { purchase: MerchantPurchaseRecord; items: MerchantPurchaseItemRecord[] };
}> {
  const purchase = await repos.findMerchantPurchaseById(input.purchaseId);
  if (!purchase) {
    throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
  }
  const items = await repos.listMerchantPurchaseItems(purchase.id);
  const moving = assertItemsSplitable(purchase, items, input.itemIds, userId);
  const remaining = items.filter((it) => !moving.some((m) => m.id === it.id));

  const splitTotal = sumItemsMinor(moving);
  const originalTotal = sumItemsMinor(remaining);

  const { purchase: neu } = await repos.createMerchantPurchase({
    userId,
    source: purchase.source,
    merchant: input.merchant?.trim() || purchase.merchant,
    orderRef: null,
    purchasedAt: purchase.purchasedAt,
    currency: purchase.currency,
    totalMinor: splitTotal,
    deliveryStatus: purchase.deliveryStatus,
    etaAt: purchase.etaAt,
    trackingCode: null,
    returnWindowDeadline: purchase.returnWindowDeadline,
    exchangeWindowDeadline: purchase.exchangeWindowDeadline,
    items: [],
  });

  const moved = await repos.moveMerchantPurchaseItems(
    moving.map((m) => m.id),
    neu.id,
  );

  const patchedOriginal = await repos.updateMerchantPurchase(purchase.id, {
    totalMinor: originalTotal,
  });
  if (!patchedOriginal) {
    throw new PurchaseMergeSplitError("NOT_FOUND", "Purchase not found");
  }

  // Heal new purchase total from moved lines (empty create + move).
  const patchedSplit =
    (await repos.updateMerchantPurchase(neu.id, {
      totalMinor: sumItemsMinor(moved),
    })) ?? neu;

  return {
    original: {
      purchase: patchedOriginal,
      items: await repos.listMerchantPurchaseItems(purchase.id),
    },
    split: {
      purchase: patchedSplit,
      items: await repos.listMerchantPurchaseItems(neu.id),
    },
  };
}
