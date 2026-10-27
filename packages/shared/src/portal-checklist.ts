/**
 * U017 — Merchant portal field checklist before leave-app.
 * Fields come from the purchase graph (order id, SKU/title, reason).
 */

export type PortalChecklistField = {
  id: "order_id" | "sku" | "reason" | "merchant";
  label: string;
  value: string;
  copyable: boolean;
};

export type PortalChecklistInput = {
  orderRef?: string | null;
  skuOrTitle?: string | null;
  reason?: string | null;
  merchant?: string | null;
};

const REASON_LABELS: Record<string, string> = {
  TOO_SMALL: "Too small",
  TOO_BIG: "Too big",
  SIZE_TOO_SMALL: "Too small",
  SIZE_TOO_BIG: "Too big",
  WRONG_ITEM: "Wrong item",
  QUALITY: "Quality issue",
  OTHER: "Other",
};

export function formatReturnReasonLabel(reason: string | null | undefined): string | null {
  if (!reason?.trim()) return null;
  const key = reason.trim().toUpperCase();
  return REASON_LABELS[key] ?? reason.trim();
}

/** Build copy-ready portal fields; omit empty values. */
export function buildPortalFieldChecklist(input: PortalChecklistInput): PortalChecklistField[] {
  const fields: PortalChecklistField[] = [];
  const order = (input.orderRef ?? "").trim();
  if (order) {
    fields.push({ id: "order_id", label: "Order ID", value: order, copyable: true });
  }
  const sku = (input.skuOrTitle ?? "").trim();
  if (sku) {
    fields.push({ id: "sku", label: "SKU / item", value: sku, copyable: true });
  }
  const reasonLabel = formatReturnReasonLabel(input.reason);
  if (reasonLabel) {
    fields.push({ id: "reason", label: "Reason", value: reasonLabel, copyable: true });
  }
  const merchant = (input.merchant ?? "").trim();
  if (merchant) {
    fields.push({ id: "merchant", label: "Merchant", value: merchant, copyable: true });
  }
  return fields;
}

/** True when checklist has the usual trio (order + item + reason) or at least one copyable field. */
export function portalChecklistReady(fields: PortalChecklistField[]): boolean {
  return fields.some((f) => f.copyable && f.value.trim().length > 0);
}
