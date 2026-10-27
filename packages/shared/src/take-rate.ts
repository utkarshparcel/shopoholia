/**
 * MON-TAKE-RATE — marketplace fee math (tailoring / resale) + payout/tax split.
 * Amounts are integer minor units (paise for INR).
 */

export type MarketplaceKind = "tailoring" | "resale";

/** Default platform take rates (bps = basis points, 100 = 1%). */
export const DEFAULT_TAKE_RATE_BPS: Record<MarketplaceKind, number> = {
  tailoring: 1_500, // 15%
  resale: 1_000, // 10%
};

/** GST on platform fee (India) — 18% inclusive of CGST+SGST / IGST. */
export const PLATFORM_FEE_GST_BPS = 1_800;

export type TakeRateInput = {
  orderAmountMinor: number;
  kind: MarketplaceKind;
  /** Override take rate; defaults from DEFAULT_TAKE_RATE_BPS. */
  takeRateBps?: number;
  /** When false, skip GST on platform fee (non-IN). Default true. */
  applyGst?: boolean;
  gstBps?: number;
};

export type TakeRateBreakdown = {
  orderAmountMinor: number;
  kind: MarketplaceKind;
  takeRateBps: number;
  platformFeeMinor: number;
  gstOnFeeMinor: number;
  /** Platform fee + GST (what WORN retains before seller payout). */
  platformTotalMinor: number;
  /** Seller net after platform fee (GST is on fee, not deducted from seller further). */
  sellerPayoutMinor: number;
};

function assertNonNeg(n: number, label: string): void {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

/** Round half-up to nearest minor unit. */
export function bpsOf(amountMinor: number, bps: number): number {
  assertNonNeg(amountMinor, "amount");
  assertNonNeg(bps, "bps");
  return Math.round((amountMinor * bps) / 10_000);
}

export function computeTakeRate(input: TakeRateInput): TakeRateBreakdown {
  assertNonNeg(input.orderAmountMinor, "orderAmountMinor");
  const takeRateBps = input.takeRateBps ?? DEFAULT_TAKE_RATE_BPS[input.kind];
  assertNonNeg(takeRateBps, "takeRateBps");
  if (takeRateBps > 10_000) throw new Error("takeRateBps cannot exceed 10000");

  const platformFeeMinor = bpsOf(input.orderAmountMinor, takeRateBps);
  const applyGst = input.applyGst !== false;
  const gstBps = input.gstBps ?? PLATFORM_FEE_GST_BPS;
  const gstOnFeeMinor = applyGst ? bpsOf(platformFeeMinor, gstBps) : 0;
  const platformTotalMinor = platformFeeMinor + gstOnFeeMinor;
  const sellerPayoutMinor = input.orderAmountMinor - platformFeeMinor;

  return {
    orderAmountMinor: input.orderAmountMinor,
    kind: input.kind,
    takeRateBps,
    platformFeeMinor,
    gstOnFeeMinor,
    platformTotalMinor,
    sellerPayoutMinor,
  };
}

export type SettlementRow = {
  id: string;
  kind: MarketplaceKind;
  orderRef: string;
  sellerId: string;
  orderAmountMinor: number;
  platformFeeMinor: number;
  gstOnFeeMinor: number;
  sellerPayoutMinor: number;
  currency: string;
  completedAt: string;
};

/** CSV export for payout / tax reporting. */
export function settlementsToCsv(rows: SettlementRow[]): string {
  const header = [
    "id",
    "kind",
    "order_ref",
    "seller_id",
    "order_amount_minor",
    "platform_fee_minor",
    "gst_on_fee_minor",
    "seller_payout_minor",
    "currency",
    "completed_at",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.id,
      r.kind,
      csvEscape(r.orderRef),
      r.sellerId,
      r.orderAmountMinor,
      r.platformFeeMinor,
      r.gstOnFeeMinor,
      r.sellerPayoutMinor,
      r.currency,
      r.completedAt,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
