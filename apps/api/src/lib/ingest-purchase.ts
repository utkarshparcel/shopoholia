import {
  computeExchangeWindowDeadline,
  computeReturnWindowDeadline,
  defaultEtaForStatus,
  findDuplicateWarnings,
  type DuplicateWarningResult,
  type PackageDeliveryStatus,
} from "@worn/shared";
import type {
  CreateMerchantPurchaseInput,
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
  Repositories,
} from "./repositories/types.js";

/**
 * Create a merchant purchase with package + exchange windows and optional
 * duplicate wardrobe tagging (ingest path).
 */
export async function createIngestedPurchase(
  repos: Repositories,
  input: CreateMerchantPurchaseInput & {
    subject?: string;
    bodyText?: string;
  },
): Promise<{
  purchase: MerchantPurchaseRecord;
  items: MerchantPurchaseItemRecord[];
  duplicateWarnings: DuplicateWarningResult[];
}> {
  const purchasedAt = input.purchasedAt;
  const deliveryStatus = (input.deliveryStatus ?? "ORDERED") as PackageDeliveryStatus;
  const etaAt =
    input.etaAt ?? defaultEtaForStatus(deliveryStatus, purchasedAt);
  const returnWindowDeadline =
    input.returnWindowDeadline ??
    computeReturnWindowDeadline(purchasedAt, input.merchant);
  const exchangeWindowDeadline =
    input.exchangeWindowDeadline ??
    computeExchangeWindowDeadline(purchasedAt, input.merchant);

  const wardrobe = await repos.listWardrobeItems(input.userId);
  const owned = wardrobe.map((w) => ({
    id: w.id,
    brand: w.brand,
    category: w.category,
    title: null as string | null,
  }));

  const taggedItems = input.items.map((item) => {
    const warning = findDuplicateWarnings(
      [{ title: item.title, brand: item.brand }],
      owned,
    )[0];
    return {
      ...item,
      duplicateWardrobeItemId:
        item.duplicateWardrobeItemId ??
        warning?.matches[0]?.wardrobeItemId ??
        null,
    };
  });

  const { purchase, items } = await repos.createMerchantPurchase({
    ...input,
    deliveryStatus,
    etaAt,
    returnWindowDeadline,
    exchangeWindowDeadline,
    items: taggedItems,
  });

  const duplicateWarnings = findDuplicateWarnings(
    items.map((it) => ({
      title: it.title,
      brand: it.brand,
      purchaseItemId: it.id,
    })),
    owned,
  );

  return { purchase, items, duplicateWarnings };
}
