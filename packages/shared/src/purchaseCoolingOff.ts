/**
 * U027 — Post-purchase cooling-off / cancel window (Closet vault / packages).
 * Distinct from N34 Play cart budget soft-lock.
 */

import { merchantCancelUrl } from "./merchantCancelUrl.js";
import { normalizeMerchantKey } from "./merchantDeepLink.js";

/** Hours from purchase until cancel window closes (merchant overrides). */
export const MERCHANT_CANCEL_WINDOW_HOURS: Record<string, number> = {
  amazon: 24,
  flipkart: 24,
  myntra: 24,
  ajio: 12,
  nykaa: 24,
  zara: 48,
};

const DEFAULT_CANCEL_HOURS = 24;

export type PurchaseCoolingOffChecklistStep = {
  id: "OPEN_ORDERS" | "CHAT_SUPPORT" | "CALL_HELPLINE" | "MARK_CANCELLED";
  label: string;
};

export type PurchaseCoolingOff = {
  active: boolean;
  releaseAt: string;
  remainingMs: number;
  cancelUrl: string | null;
  checklist: PurchaseCoolingOffChecklistStep[];
  message: string;
};

export function cancelWindowHours(merchant: string): number {
  const key = normalizeMerchantKey(merchant);
  if (!key) return DEFAULT_CANCEL_HOURS;
  return (
    MERCHANT_CANCEL_WINDOW_HOURS[key] ??
    MERCHANT_CANCEL_WINDOW_HOURS[key.replace(/_/g, "")] ??
    DEFAULT_CANCEL_HOURS
  );
}

export function computeCancelDeadline(
  purchasedAt: Date | string,
  merchant: string,
): Date {
  const start =
    purchasedAt instanceof Date ? purchasedAt.getTime() : Date.parse(purchasedAt);
  const base = Number.isNaN(start) ? Date.now() : start;
  return new Date(base + cancelWindowHours(merchant) * 3_600_000);
}

const CHECKLIST_WITH_URL: PurchaseCoolingOffChecklistStep[] = [
  { id: "OPEN_ORDERS", label: "Open merchant orders page" },
  { id: "MARK_CANCELLED", label: "Confirm cancel in WORN" },
];

const CHECKLIST_NO_URL: PurchaseCoolingOffChecklistStep[] = [
  { id: "OPEN_ORDERS", label: "Open merchant app / website orders" },
  { id: "CHAT_SUPPORT", label: "Chat support — ask to cancel" },
  { id: "CALL_HELPLINE", label: "Call helpline if chat fails" },
  { id: "MARK_CANCELLED", label: "Confirm cancel in WORN" },
];

/**
 * Cooling-off timer for an early-stage purchase (ORDERED / not yet delivered).
 * Returns null when window expired, already cancelled, or delivery progressed too far.
 */
export function buildPurchaseCoolingOff(input: {
  merchant: string;
  purchasedAt: Date | string;
  deliveryStatus?: string | null;
  now?: Date;
}): PurchaseCoolingOff | null {
  const status = (input.deliveryStatus ?? "ORDERED").toUpperCase();
  if (status === "CANCELLED" || status === "DELIVERED" || status === "FAILED") {
    return null;
  }
  // Still cancelable while ordered / early ship — not out for delivery.
  if (status === "OUT_FOR_DELIVERY" || status === "IN_TRANSIT") {
    return null;
  }

  const now = input.now ?? new Date();
  const releaseAt = computeCancelDeadline(input.purchasedAt, input.merchant);
  const remainingMs = releaseAt.getTime() - now.getTime();
  if (remainingMs <= 0) return null;

  const cancelUrl = merchantCancelUrl(input.merchant);
  const hours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
  return {
    active: true,
    releaseAt: releaseAt.toISOString(),
    remainingMs,
    cancelUrl,
    checklist: cancelUrl ? CHECKLIST_WITH_URL : CHECKLIST_NO_URL,
    message: cancelUrl
      ? `Cancel within ${hours}h — open merchant cancel link.`
      : `Cancel within ${hours}h — use checklist (no merchant cancel URL).`,
  };
}
