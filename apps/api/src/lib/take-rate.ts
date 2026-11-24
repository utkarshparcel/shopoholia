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

/** Where settlements live: Postgres in production (shared by the API and workers), memory in dev. */
export type SettlementRepos = {
  insertMarketplaceSettlement(row: SettlementRow): Promise<{ row: SettlementRow; created: boolean }>;
  listMarketplaceSettlements(opts?: { kind?: MarketplaceKind; sellerId?: string }): Promise<SettlementRow[]>;
};

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

/** Settles a completed order once: a repeat for the same (kind, orderRef) returns the first row. */
export async function settleCompletedOrder(
  repos: SettlementRepos,
  input: SettleCompletedOrderInput,
): Promise<SettlementRow | null> {
  if (!takeRateFeatureEnabled()) return null;
  if (input.orderAmountMinor <= 0) return null;

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
  return (await repos.insertMarketplaceSettlement(row)).row;
}

export function listSettlements(
  repos: SettlementRepos,
  opts?: { kind?: MarketplaceKind; sellerId?: string },
): Promise<SettlementRow[]> {
  return repos.listMarketplaceSettlements(opts);
}

export async function exportSettlementsCsv(
  repos: SettlementRepos,
  opts?: { kind?: MarketplaceKind; sellerId?: string },
): Promise<string> {
  return settlementsToCsv(await listSettlements(repos, opts));
}
