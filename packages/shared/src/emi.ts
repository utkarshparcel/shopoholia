/**
 * N13 — BNPL / EMI fashion tracker: remaining balance, due schedule, nudge delay.
 */

export const EMI_NUDGE_LEAD_MS = 2 * 86_400_000; // 2 days before due

/** Remaining after a payment (never negative). */
export function remainingAfterPayment(remainingMinor: number, paymentMinor: number): number {
  if (remainingMinor <= 0) return 0;
  if (paymentMinor <= 0) return remainingMinor;
  return Math.max(0, remainingMinor - paymentMinor);
}

export type EmiInstallment = {
  index: number;
  dueOn: string; // YYYY-MM-DD
  amountMinor: number;
};

/**
 * Build upcoming installment schedule from remaining + installment size + next due.
 * Caps at 48 installments.
 */
export function nextDueSchedule(input: {
  remainingMinor: number;
  installmentMinor: number;
  nextDueOn: string;
  maxInstallments?: number;
}): EmiInstallment[] {
  const installment = Math.max(1, Math.floor(input.installmentMinor));
  let remaining = Math.max(0, Math.floor(input.remainingMinor));
  if (remaining === 0) return [];
  const max = Math.min(48, input.maxInstallments ?? 48);
  const out: EmiInstallment[] = [];
  let due = parseYmd(input.nextDueOn);
  for (let i = 0; i < max && remaining > 0; i++) {
    const amount = Math.min(installment, remaining);
    out.push({
      index: i + 1,
      dueOn: formatYmd(due),
      amountMinor: amount,
    });
    remaining -= amount;
    due = addMonths(due, 1);
  }
  return out;
}

/**
 * Delay until EMI due nudge. Fires at `dueOn − leadMs` (local midnight UTC date).
 * Returns null when already past due; 100 when inside lead window.
 */
export function computeEmiNudgeDelayMs(
  dueOn: string,
  leadMs: number = EMI_NUDGE_LEAD_MS,
  nowMs: number = Date.now(),
): number | null {
  const dueMs = parseYmd(dueOn).getTime();
  if (dueMs <= nowMs) return null;
  const delayMs = dueMs - leadMs - nowMs;
  return delayMs <= 0 ? 100 : delayMs;
}

export function emiDueJobId(planId: string, dueOn: string): string {
  return `emi-due:${planId}:${dueOn}`;
}

/** Days until `YYYY-MM-DD` due (UTC midnight). Negative when overdue. */
export function emiDaysUntilDue(dueOn: string, now: Date = new Date()): number {
  const due = parseYmd(dueOn).getTime();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((due - start) / 86_400_000);
}

/** True when ACTIVE plan is due within `withinDays` (inclusive) or overdue. */
export function emiDueWithinDays(
  input: { status: string; remainingMinor: number; nextDueOn: string },
  withinDays = 7,
  now: Date = new Date(),
): boolean {
  if (input.status !== "ACTIVE" || input.remainingMinor <= 0) return false;
  const days = emiDaysUntilDue(input.nextDueOn, now);
  return days <= withinDays;
}

export type EmiDontMissCard = {
  planId: string;
  headline: string;
  body: string;
  dueOn: string;
  daysUntilDue: number;
  installmentMinor: number;
  remainingMinor: number;
  currency: string;
  deepLink: string;
};

/**
 * W030 — “Don’t miss” card for fashion EMI due within 7 days.
 */
export function buildEmiDontMissCard(input: {
  id: string;
  provider: string;
  merchant?: string | null;
  installmentMinor: number;
  remainingMinor: number;
  nextDueOn: string;
  currency?: string;
  now?: Date;
}): EmiDontMissCard | null {
  const now = input.now ?? new Date();
  if (
    !emiDueWithinDays(
      {
        status: "ACTIVE",
        remainingMinor: input.remainingMinor,
        nextDueOn: input.nextDueOn,
      },
      7,
      now,
    )
  ) {
    return null;
  }
  const days = emiDaysUntilDue(input.nextDueOn, now);
  const currency = input.currency ?? "INR";
  const label = input.merchant
    ? `${input.provider} · ${input.merchant}`
    : input.provider;
  const when =
    days < 0
      ? "overdue"
      : days === 0
        ? "due today"
        : days === 1
          ? "due tomorrow"
          : `due in ${days} days`;
  return {
    planId: input.id,
    headline: `Don't miss — EMI ${when}`,
    body: `${label}: installment coming up. Mark paid when you clear it.`,
    dueOn: input.nextDueOn,
    daysUntilDue: days,
    installmentMinor: input.installmentMinor,
    remainingMinor: input.remainingMinor,
    currency,
    deepLink: `worn://accountant?focus=emi&plan=${encodeURIComponent(input.id)}`,
  };
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0));
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}
