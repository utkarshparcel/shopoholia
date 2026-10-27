import type { Repositories } from "./repositories/types.js";
import { resolveCandidatePriceMinor } from "./prebuy-fit.js";
import { sendSpendEnvelopeAlerts } from "./budget.js";
import { captureException } from "./sentry.js";

export const PLAY_MERCHANT = "WORN Play";

export type TrackPlayBuyResult = {
  purchaseId: string;
  itemCount: number;
  wardrobeItemIds: string[];
  created: boolean;
};

/**
 * Seed a Closet `merchant_purchases` row from a Play order (sanctioned bridge).
 * Idempotent on orderRef = Play order id.
 */
export async function trackPlayBuyInCloset(
  repos: Repositories,
  input: {
    userId: string;
    orderId: string;
    seedWardrobe?: boolean;
  },
): Promise<TrackPlayBuyResult> {
  const order = await repos.findOrderById(input.orderId);
  if (!order || order.userId !== input.userId) {
    throw new TrackPlayBuyError("NOT_FOUND", "Order not found");
  }

  const existing = await repos.findMerchantPurchaseByOrderRef(input.userId, order.id);
  if (existing) {
    const items = await repos.listMerchantPurchaseItems(existing.id);
    const wardrobe = input.seedWardrobe
      ? await ensureWardrobeFromPurchaseItems(repos, input.userId, items)
      : [];
    return {
      purchaseId: existing.id,
      itemCount: items.length,
      wardrobeItemIds: wardrobe,
      created: false,
    };
  }

  const orderItems = await repos.listOrderItemsByOrderId(order.id);
  if (orderItems.length === 0) {
    throw new TrackPlayBuyError("EMPTY_ORDER", "Order has no items to track");
  }

  const variantIds = orderItems.map((i) => i.listingVariantId);
  const variants = await repos.findVariantsByIds(variantIds);
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const listingIds = [...new Set(variants.map((v) => v.listingId))];
  const listings = await repos.findListingsByIds(listingIds);
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  const purchaseItems = [];
  let totalMinor = 0;
  for (const oi of orderItems) {
    const variant = variantMap.get(oi.listingVariantId);
    const listing = variant ? listingMap.get(variant.listingId) : null;
    const title = listing?.title ?? "Play item";
    const category = listing?.category ?? "APPAREL";
    const priceMinor = resolveCandidatePriceMinor({
      realPrice: listing?.realPrice,
      coinPrice: oi.coinPriceSnapshot,
      qty: oi.quantity,
    });
    // resolveCandidatePriceMinor already multiplies qty when from coins/real;
    // store unit-ish price with qty for ledger allocation.
    const unitMinor = Math.max(1, Math.round(priceMinor / Math.max(1, oi.quantity)));
    totalMinor += unitMinor * oi.quantity;
    purchaseItems.push({
      title,
      category,
      priceMinor: unitMinor,
      qty: oi.quantity,
      imageKey: listing?.productImageKeys?.[0] ?? null,
    });
  }

  const { purchase, items, created } = await repos.createMerchantPurchase({
    userId: input.userId,
    source: "MANUAL",
    merchant: PLAY_MERCHANT,
    orderRef: order.id,
    purchasedAt: order.placedAt,
    currency: "INR",
    totalMinor,
    items: purchaseItems,
  });

  const wardrobeItemIds = input.seedWardrobe
    ? await ensureWardrobeFromPurchaseItems(repos, input.userId, items)
    : [];

  if (created !== false) {
    // N42: the new purchase may put a budget past 80%; the push runs off the response path.
    void sendSpendEnvelopeAlerts(repos, input.userId).catch((err) =>
      captureException(err, { tags: { surface: "spend_envelope_alert" } }),
    );
  }

  return {
    purchaseId: purchase.id,
    itemCount: items.length,
    wardrobeItemIds,
    // false when a concurrent track won the (user, orderRef) insert (#38).
    created: created !== false,
  };
}

async function ensureWardrobeFromPurchaseItems(
  repos: Repositories,
  userId: string,
  items: Array<{
    id: string;
    title: string;
    category: string | null;
    priceMinor: number;
    imageKey: string | null;
  }>,
): Promise<string[]> {
  const existing = await repos.listWardrobeItems(userId);
  const linked = new Set(
    existing.map((w) => w.purchaseItemId).filter((id): id is string => Boolean(id)),
  );
  const ids: string[] = [];
  for (const it of items) {
    if (linked.has(it.id)) {
      const found = existing.find((w) => w.purchaseItemId === it.id);
      if (found) ids.push(found.id);
      continue;
    }
    const row = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: it.category ?? "APPAREL",
      colors: [],
      brand: PLAY_MERCHANT,
      costMinor: it.priceMinor,
      imageKeys: it.imageKey ? [it.imageKey] : [],
      garmentImageKey: it.imageKey,
      purchaseItemId: it.id,
      laundryStatus: "CLEAN",
    });
    ids.push(row.id);
  }
  return ids;
}

export class TrackPlayBuyError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "EMPTY_ORDER",
    message: string,
  ) {
    super(message);
    this.name = "TrackPlayBuyError";
  }
}
