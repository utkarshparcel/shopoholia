/**
 * U038 — tailor order status chase + T-1d pickup reminder + mark received.
 */

import type { TailorOrderState } from "./schemas/fit.js";

export const TAILOR_TIMELINE: TailorOrderState[] = [
  "PENDING",
  "CONFIRMED",
  "IN_STITCHING",
  "SHIPPED",
  "DELIVERED",
];

export type TailorTimelineStep = {
  state: TailorOrderState;
  label: string;
  reached: boolean;
  current: boolean;
};

const LABELS: Record<TailorOrderState, string> = {
  PENDING: "Order placed",
  CONFIRMED: "Confirmed",
  IN_STITCHING: "In stitching",
  SHIPPED: "Ready / shipped",
  DELIVERED: "Received",
  CANCELLED: "Cancelled",
};

export function tailorStatusTimeline(state: TailorOrderState): TailorTimelineStep[] {
  if (state === "CANCELLED") {
    return [
      {
        state: "CANCELLED",
        label: LABELS.CANCELLED,
        reached: true,
        current: true,
      },
    ];
  }
  const idx = TAILOR_TIMELINE.indexOf(state);
  return TAILOR_TIMELINE.map((s, i) => ({
    state: s,
    label: LABELS[s],
    reached: i <= idx,
    current: i === idx,
  }));
}

/** Pickup reminder date = day before expectedPickup (YYYY-MM-DD). */
export function tailorPickupNudgeDate(expectedPickupOn: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedPickupOn)) return null;
  const [y, m, d] = expectedPickupOn.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, daySafe(d)));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function daySafe(d: number | undefined): number {
  return typeof d === "number" && d > 0 ? d : 1;
}

export function shouldSendTailorPickupNudge(opts: {
  expectedPickupOn: string;
  asOf: string;
  alreadySent?: boolean;
  state: TailorOrderState;
}): boolean {
  if (opts.alreadySent) return false;
  if (opts.state === "DELIVERED" || opts.state === "CANCELLED") return false;
  const nudge = tailorPickupNudgeDate(opts.expectedPickupOn);
  if (!nudge) return false;
  return opts.asOf >= nudge && opts.asOf <= opts.expectedPickupOn;
}

export function canMarkTailorReceived(state: TailorOrderState): boolean {
  return state === "SHIPPED" || state === "IN_STITCHING" || state === "CONFIRMED";
}
