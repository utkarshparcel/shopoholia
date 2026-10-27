export type ReturnState =
  | "REQUESTED"
  | "INITIATED"
  | "PICKUP_SCHEDULED"
  | "CONFIRMED"
  | "REFUNDED"
  | "EXPIRED"
  | "CANCELLED";

const TRANSITIONS: Record<ReturnState, ReturnState[]> = {
  REQUESTED: ["INITIATED", "CANCELLED", "EXPIRED"],
  INITIATED: ["PICKUP_SCHEDULED", "CONFIRMED", "CANCELLED", "EXPIRED"],
  /** U019 — cancel pickup returns to INITIATED; reschedule stays PICKUP_SCHEDULED via same-state patch. */
  PICKUP_SCHEDULED: ["INITIATED", "CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["REFUNDED", "EXPIRED"],
  REFUNDED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function isValidReturnTransition(from: ReturnState, to: ReturnState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function nextReturnStates(state: ReturnState): ReturnState[] {
  return TRANSITIONS[state] ?? [];
}
