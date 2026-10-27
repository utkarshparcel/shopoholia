/**
 * MON-TAKE-RATE — settle completed marketplace orders + CSV report.
 */

import { randomUUID } from "node:crypto";
import {
  computeTakeRate,
  settlementsToCsv,
  type MarketplaceKind,
  type SettlementRow,
} from "@worn/shared";

const settlements: SettlementRow[] = [];

/** Default estimated order amounts when catalog price is absent (scaffold). */
export const DEFAULT_TAILORING_ORDER_MINOR = 150_000; // ₹1,500

export function takeRateFeatureEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FEATURE_TAKE_RATE === "1" || env.NODE_ENV !== "production";
}

export type SettleCompletedOrderInput = {
  kind: MarketplaceKind;
  orderRef: string;
  sellerId: string;
  orderAmountMinor: number;
  currency?: string;
  completedAt?: Date;
  applyGst?: boolean;
};

export function settleCompletedOrder(
  input: SettleCompletedOrderInput,
): SettlementRow | null {
  if (!takeRateFeatureEnabled()) return null;
  if (input.orderAmountMinor <= 0) return null;

  // Idempotent on orderRef
  const existing = settlements.find((s) => s.orderRef === input.orderRef);
  if (existing) return existing;

  const breakdown = computeTakeRate({
    orderAmountMinor: input.orderAmountMinor,
    kind: input.kind,
    applyGst: input.applyGst,
  });

  const row: SettlementRow = {
    id: randomUUID(),
    kind: input.kind,
    orderRef: input.orderRef,
    sellerId: input.sellerId,
    orderAmountMinor: breakdown.orderAmountMinor,
    platformFeeMinor: breakdown.platformFeeMinor,
    gstOnFeeMinor: breakdown.gstOnFeeMinor,
    sellerPayoutMinor: breakdown.sellerPayoutMinor,
    currency: input.currency ?? "INR",
    completedAt: (input.completedAt ?? new Date()).toISOString(),
  };
  settlements.push(row);
  return row;
}

export function listSettlements(opts?: {
  kind?: MarketplaceKind;
  sellerId?: string;
}): SettlementRow[] {
  return settlements.filter((s) => {
    if (opts?.kind && s.kind !== opts.kind) return false;
    if (opts?.sellerId && s.sellerId !== opts.sellerId) return false;
    return true;
  });
}

export function exportSettlementsCsv(opts?: {
  kind?: MarketplaceKind;
  sellerId?: string;
}): string {
  return settlementsToCsv(listSettlements(opts));
}

export function __resetSettlementsForTests(): void {
  settlements.length = 0;
}
