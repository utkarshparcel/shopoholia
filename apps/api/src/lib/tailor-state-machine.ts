import type { TailorOrderState } from "@worn/shared";

/** Ladder used by jobs: PENDING → CONFIRMED → IN_STITCHING → SHIPPED → DELIVERED */
const TRANSITIONS: Record<TailorOrderState, TailorOrderState[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_STITCHING", "CANCELLED"],
  IN_STITCHING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function isValidTailorTransition(from: TailorOrderState, to: TailorOrderState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function nextTailorStates(state: TailorOrderState): TailorOrderState[] {
  return TRANSITIONS[state] ?? [];
}

export function isTerminalTailorState(state: TailorOrderState): boolean {
  return state === "DELIVERED" || state === "CANCELLED";
}
