/**
 * Dry-clean ticket tracker state machine (N22-DRYCLEAN-TRACK).
 * Ticket + pickup date → IN_LAUNDRY → CLEAN on confirm.
 */

export type LaundryStatus = "CLEAN" | "DIRTY" | "IN_LAUNDRY";

/** Logical dry-clean phase derived from wardrobe fields. */
export type DryCleanPhase = "IDLE" | "AT_CLEANER" | "RETURNED";

export type DryCleanItemLike = {
  laundryStatus?: LaundryStatus | null;
  dryCleanTicket?: string | null;
  dryCleanPickupOn?: string | null;
};

export type DryCleanDropOffInput = {
  ticket: string;
  pickupOn: string; // YYYY-MM-DD
};

export type DryCleanPatch = {
  laundryStatus: LaundryStatus;
  dryCleanTicket: string | null;
  dryCleanPickupOn: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dryCleanPhase(item: DryCleanItemLike): DryCleanPhase {
  const ticket = (item.dryCleanTicket ?? "").trim();
  const laundry = item.laundryStatus ?? "CLEAN";
  if (ticket && laundry === "IN_LAUNDRY") return "AT_CLEANER";
  if (ticket && laundry === "CLEAN") return "RETURNED";
  return "IDLE";
}

export function isValidDryCleanTransition(from: DryCleanPhase, to: DryCleanPhase): boolean {
  if (from === to) return true;
  if (from === "IDLE" && to === "AT_CLEANER") return true;
  if (from === "AT_CLEANER" && to === "RETURNED") return true;
  if (from === "AT_CLEANER" && to === "IDLE") return true; // cancel
  if (from === "RETURNED" && to === "IDLE") return true; // clear after confirm
  if (from === "RETURNED" && to === "AT_CLEANER") return true; // re-drop
  if (from === "IDLE" && to === "RETURNED") return false;
  return false;
}

export function applyDryCleanDropOff(
  item: DryCleanItemLike,
  input: DryCleanDropOffInput,
): { ok: true; patch: DryCleanPatch; from: DryCleanPhase; to: DryCleanPhase } | { ok: false; error: string } {
  const ticket = input.ticket.trim();
  if (!ticket) return { ok: false, error: "ticket required" };
  if (!DATE_RE.test(input.pickupOn)) {
    return { ok: false, error: "pickupOn must be YYYY-MM-DD" };
  }
  const from = dryCleanPhase(item);
  const to: DryCleanPhase = "AT_CLEANER";
  if (!isValidDryCleanTransition(from, to) && from !== "AT_CLEANER") {
    // Allow re-drop from RETURNED/IDLE; AT_CLEANER updates ticket/date in place.
  }
  if (from === "AT_CLEANER") {
    // Update ticket/date while still at cleaner
  } else if (!isValidDryCleanTransition(from, to)) {
    return { ok: false, error: `cannot drop off from ${from}` };
  }
  return {
    ok: true,
    from,
    to,
    patch: {
      laundryStatus: "IN_LAUNDRY",
      dryCleanTicket: ticket,
      dryCleanPickupOn: input.pickupOn,
    },
  };
}

export function applyDryCleanConfirm(
  item: DryCleanItemLike,
): { ok: true; patch: DryCleanPatch; from: DryCleanPhase; to: DryCleanPhase } | { ok: false; error: string } {
  const from = dryCleanPhase(item);
  if (from !== "AT_CLEANER") {
    return { ok: false, error: `cannot confirm pickup from ${from}` };
  }
  const to: DryCleanPhase = "RETURNED";
  return {
    ok: true,
    from,
    to,
    patch: {
      laundryStatus: "CLEAN",
      dryCleanTicket: null,
      dryCleanPickupOn: null,
    },
  };
}

export function applyDryCleanCancel(
  item: DryCleanItemLike,
): { ok: true; patch: DryCleanPatch; from: DryCleanPhase; to: DryCleanPhase } | { ok: false; error: string } {
  const from = dryCleanPhase(item);
  if (from !== "AT_CLEANER") {
    return { ok: false, error: `cannot cancel from ${from}` };
  }
  return {
    ok: true,
    from,
    to: "IDLE",
    patch: {
      laundryStatus: "DIRTY",
      dryCleanTicket: null,
      dryCleanPickupOn: null,
    },
  };
}
