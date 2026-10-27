import { describe, expect, it } from "vitest";
import {
  assertItemsSplitable,
  assertPurchasesMergeable,
  lineMinor,
  sumItemsMinor,
  PurchaseMergeSplitError,
} from "./purchase-merge-split.js";
import type {
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
} from "./repositories/types.js";

const now = new Date();

function purchase(
  partial: Partial<MerchantPurchaseRecord> & { id: string; userId: string },
): MerchantPurchaseRecord {
  return {
    source: "EMAIL",
    merchant: "Shop",
    orderRef: null,
    purchasedAt: now,
    currency: "INR",
    totalMinor: 0,
    status: "CONFIRMED",
    rawDocId: null,
    deliveryStatus: "ORDERED",
    etaAt: null,
    trackingCode: null,
    deliveredAt: null,
    returnWindowDeadline: null,
    exchangeWindowDeadline: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function item(
  partial: Partial<MerchantPurchaseItemRecord> & { id: string; purchaseId: string },
): MerchantPurchaseItemRecord {
  return {
    title: "T",
    category: null,
    brand: null,
    priceMinor: 100,
    imageKey: null,
    qty: 1,
    duplicateWardrobeItemId: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe("purchase-merge-split unit", () => {
  it("computes line and purchase totals", () => {
    expect(lineMinor({ priceMinor: 199, qty: 2 })).toBe(398);
    expect(sumItemsMinor([])).toBe(0);
  });

  it("throws typed errors on bad merge/split", () => {
    const a = purchase({ id: "1", userId: "u", currency: "INR" });
    const b = purchase({ id: "2", userId: "u", currency: "EUR" });
    try {
      assertPurchasesMergeable(a, b, "u");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PurchaseMergeSplitError);
      expect((e as PurchaseMergeSplitError).code).toBe("CONFLICT");
    }

    const items = [
      item({ id: "i1", purchaseId: "1" }),
      item({ id: "i2", purchaseId: "1" }),
    ];
    expect(() => assertItemsSplitable(a, items, ["i1", "i1"], "u")).toThrow(
      /Duplicate/,
    );
  });
});
