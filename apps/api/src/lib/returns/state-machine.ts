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

/** Every state that may move to `to`: the guard for a conditional update. */
export function returnStatesInto(to: ReturnState): ReturnState[] {
  return (Object.keys(TRANSITIONS) as ReturnState[]).filter((from) => TRANSITIONS[from].includes(to));
}

/** States that hold the purchase line (the open-return unique index covers all but CANCELLED/EXPIRED). */
export const OPEN_RETURN_STATES: ReturnState[] = ["REQUESTED", "INITIATED", "PICKUP_SCHEDULED", "CONFIRMED", "REFUNDED"];

/** A guarded return update found the row in a state it may not move from (→ 409). */
export class ReturnStateConflictError extends Error {
  constructor(public readonly state: string) {
    super(`Return is ${state}`);
    this.name = "ReturnStateConflictError";
  }
}
