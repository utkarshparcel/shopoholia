/**
 * U020 — Refund chase checklist when past merchant ETA and not ledger-credited.
 */

export const REFUND_CHASE_STEP_IDS = ["PORTAL", "CHAT", "BANK"] as const;
export type RefundChaseStepId = (typeof REFUND_CHASE_STEP_IDS)[number];

export type RefundChaseStep = {
  id: RefundChaseStepId;
  label: string;
  hint: string;
};

export const REFUND_CHASE_STEPS: RefundChaseStep[] = [
  {
    id: "PORTAL",
    label: "Check merchant portal",
    hint: "Open returns / refund status on the merchant site",
  },
  {
    id: "CHAT",
    label: "Message merchant support",
    hint: "Ask for refund timeline with order ID",
  },
  {
    id: "BANK",
    label: "Check bank / UPI statement",
    hint: "Confirm credit landed outside Closet ledger",
  },
];

export type RefundChaseInput = {
  etaAt?: string | Date | null;
  ledgerCredited: boolean;
  chaseSnoozeUntil?: string | Date | null;
  now?: Date;
};

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Past ETA, not credited, and not under an active snooze. */
export function needsRefundChase(input: RefundChaseInput): boolean {
  if (input.ledgerCredited) return false;
  const etaMs = toMs(input.etaAt ?? null);
  if (etaMs == null) return false;
  const now = input.now ?? new Date();
  if (now.getTime() < etaMs) return false;
  const snoozeMs = toMs(input.chaseSnoozeUntil ?? null);
  if (snoozeMs != null && now.getTime() < snoozeMs) return false;
  return true;
}

/** Default snooze: +3 days from now. */
export function refundChaseSnoozeUntil(now: Date = new Date(), days = 3): Date {
  return new Date(now.getTime() + days * 86_400_000);
}
