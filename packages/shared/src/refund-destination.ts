/**
 * U012 — refund destination (where the merchant refund landed).
 */

export const REFUND_DESTINATIONS = [
  "ORIGINAL_CARD",
  "STORE_CREDIT",
  "UPI",
] as const;

export type RefundDestination = (typeof REFUND_DESTINATIONS)[number];

export const REFUND_DESTINATION_LABELS: Record<RefundDestination, string> = {
  ORIGINAL_CARD: "Original card",
  STORE_CREDIT: "Store credit",
  UPI: "UPI",
};

/** Ledger refType prefix for return refunds. */
export const REFUND_REF_TYPE_PREFIX = "return.refund";

export function refundLedgerRefType(destination: RefundDestination): string {
  return `${REFUND_REF_TYPE_PREFIX}:${destination}`;
}

export function parseRefundDestinationFromRefType(
  refType: string | null | undefined,
): RefundDestination | null {
  const raw = (refType ?? "").trim();
  if (!raw.startsWith(`${REFUND_REF_TYPE_PREFIX}:`)) {
    if (raw === REFUND_REF_TYPE_PREFIX) return null;
    return null;
  }
  const dest = raw.slice(REFUND_REF_TYPE_PREFIX.length + 1);
  return (REFUND_DESTINATIONS as readonly string[]).includes(dest)
    ? (dest as RefundDestination)
    : null;
}

/** True when ledger description/refType matches an accountant refund-destination filter. */
export function matchesRefundDestinationFilter(
  refTypeOrDescription: string | null | undefined,
  filter: RefundDestination | "ALL" | null | undefined,
): boolean {
  if (!filter || filter === "ALL") return true;
  const dest = parseRefundDestinationFromRefType(refTypeOrDescription);
  if (dest) return dest === filter;
  // Description form: "REFUND return.refund:UPI"
  const needle = `${REFUND_REF_TYPE_PREFIX}:${filter}`;
  return (refTypeOrDescription ?? "").includes(needle);
}

/**
 * Account selection driven by user-declared destination:
 * - STORE_CREDIT → matching merchant store credit when present
 * - ORIGINAL_CARD / UPI → CASH (bank/wallet landing)
 */
export function preferredRefundAccountKind(
  destination: RefundDestination,
): "CASH" | "STORE_CREDIT" {
  return destination === "STORE_CREDIT" ? "STORE_CREDIT" : "CASH";
}
