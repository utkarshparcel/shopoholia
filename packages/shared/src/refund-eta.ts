/**
 * N16 — Refund ETA board: track INITIATED → CONFIRMED → REFUNDED until money_ledger credit.
 * ETA guesses mirror typical India marketplace refund settlement windows.
 */

import { daysLeft } from "./exchange-windows.js";
import type { ReturnState } from "./schemas/returns.js";

export const REFUND_ETA_PIPELINE = ["INITIATED", "CONFIRMED", "REFUNDED"] as const;
export type RefundEtaPipelineState = (typeof REFUND_ETA_PIPELINE)[number];

export type RefundEtaStepState = "done" | "current" | "todo";

export type RefundEtaPipelineStep = {
  id: RefundEtaPipelineState;
  label: string;
  state: RefundEtaStepState;
};

const PIPELINE_LABELS: Record<RefundEtaPipelineState, string> = {
  INITIATED: "Initiated",
  CONFIRMED: "Confirmed",
  REFUNDED: "Refunded",
};

const PIPELINE_INDEX: Record<string, number> = Object.fromEntries(
  REFUND_ETA_PIPELINE.map((s, i) => [s, i]),
);

/** Days from current state until expected ledger credit (null when already refunded). */
export function refundEtaDaysForState(state: string): number | null {
  if (state === "INITIATED" || state === "PICKUP_SCHEDULED") return 10;
  if (state === "CONFIRMED") return 5;
  return null;
}

export function isOnRefundEtaBoard(state: string): boolean {
  return (
    state === "INITIATED" ||
    state === "PICKUP_SCHEDULED" ||
    state === "CONFIRMED" ||
    state === "REFUNDED"
  );
}

/** Open board rows — still waiting on ledger credit. */
export function isOpenRefundEta(state: string): boolean {
  return state === "INITIATED" || state === "PICKUP_SCHEDULED" || state === "CONFIRMED";
}

/**
 * Guess when refund lands in money_ledger.
 * Prefer last state change (`from`); fall back to `now` if `from` is stale.
 */
export function guessRefundEtaAt(
  state: string,
  from: Date = new Date(),
  now: Date = new Date(),
): Date | null {
  const days = refundEtaDaysForState(state);
  if (days == null) return null;
  const staleMs = 30 * 86_400_000;
  const base = from.getTime() > now.getTime() - staleMs ? from : now;
  return new Date(base.getTime() + days * 86_400_000);
}

/** INITIATED → CONFIRMED → REFUNDED step markers for the board. */
export function refundEtaPipeline(state: string): RefundEtaPipelineStep[] {
  // Pickup is logistics between initiate and confirm — still on the INITIATED refund step.
  const pipelineState = state === "PICKUP_SCHEDULED" ? "INITIATED" : state;
  const idx = PIPELINE_INDEX[pipelineState];
  if (idx == null) {
    return REFUND_ETA_PIPELINE.map((id) => ({
      id,
      label: PIPELINE_LABELS[id],
      state: "todo" as const,
    }));
  }
  return REFUND_ETA_PIPELINE.map((id, i) => {
    let stepState: RefundEtaStepState = "todo";
    if (i < idx) stepState = "done";
    else if (i === idx) stepState = "current";
    return { id, label: PIPELINE_LABELS[id], state: stepState };
  });
}

export type RefundEtaBoardInput = {
  id: string;
  state: ReturnState;
  refundMinor: number | null;
  merchant?: string | null;
  itemTitle?: string | null;
  tracking?: string | null;
  updatedAt: string | Date;
  createdAt?: string | Date;
};

export type RefundEtaLedgerHint = {
  amountMinor: number;
  creditedAt?: string | Date | null;
};

export type RefundEtaBoardRow = {
  returnId: string;
  merchant: string | null;
  itemTitle: string | null;
  tracking: string | null;
  state: ReturnState;
  pipeline: RefundEtaPipelineStep[];
  /** ISO guess for ledger credit; null once REFUNDED. */
  etaAt: string | null;
  daysLeft: number | null;
  refundMinor: number | null;
  ledgerCredited: boolean;
  ledgerAmountMinor: number | null;
  ledgerCreditedAt: string | null;
};

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(0);
  return value instanceof Date ? value : new Date(value);
}

export function buildRefundEtaBoardRow(
  input: RefundEtaBoardInput,
  ledger: RefundEtaLedgerHint | null = null,
  now: Date = new Date(),
): RefundEtaBoardRow {
  const from = toDate(input.updatedAt);
  const eta = guessRefundEtaAt(input.state, from, now);
  const ledgerCredited = Boolean(ledger);
  const creditedAt = ledger?.creditedAt ? toDate(ledger.creditedAt).toISOString() : null;

  return {
    returnId: input.id,
    merchant: input.merchant ?? null,
    itemTitle: input.itemTitle ?? null,
    tracking: input.tracking ?? null,
    state: input.state,
    pipeline: refundEtaPipeline(input.state),
    etaAt: eta ? eta.toISOString() : null,
    daysLeft: eta ? daysLeft(eta, now) : null,
    refundMinor: input.refundMinor,
    ledgerCredited,
    ledgerAmountMinor: ledger?.amountMinor ?? null,
    ledgerCreditedAt: creditedAt,
  };
}

/**
 * Build board rows. Default open-only (INITIATED|CONFIRMED); pass `all` to include REFUNDED.
 */
export function buildRefundEtaBoard(
  inputs: RefundEtaBoardInput[],
  ledgerByReturnId: Map<string, RefundEtaLedgerHint> | Record<string, RefundEtaLedgerHint> = {},
  opts: { all?: boolean; now?: Date } = {},
): RefundEtaBoardRow[] {
  const now = opts.now ?? new Date();
  const all = opts.all === true;
  const map =
    ledgerByReturnId instanceof Map
      ? ledgerByReturnId
      : new Map(Object.entries(ledgerByReturnId));

  return inputs
    .filter((r) => (all ? isOnRefundEtaBoard(r.state) : isOpenRefundEta(r.state)))
    .map((r) => buildRefundEtaBoardRow(r, map.get(r.id) ?? null, now))
    .sort((a, b) => {
      // Open first, then soonest ETA, then returnId for stability
      const aOpen = isOpenRefundEta(a.state) ? 0 : 1;
      const bOpen = isOpenRefundEta(b.state) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      const aEta = a.etaAt ? Date.parse(a.etaAt) : Number.POSITIVE_INFINITY;
      const bEta = b.etaAt ? Date.parse(b.etaAt) : Number.POSITIVE_INFINITY;
      if (aEta !== bEta) return aEta - bEta;
      return a.returnId.localeCompare(b.returnId);
    });
}
