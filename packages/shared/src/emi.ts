/**
 * N13 — BNPL / EMI fashion tracker: remaining balance, due schedule, nudge delay.
 */

import { localDateKey, resolveTimeZone } from "./local-time.js";

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

/** The day of the month a YYYY-MM-DD date falls on (1–31). */
export function emiDueDayOf(ymd: string): number {
  return parseYmd(ymd).getUTCDate();
}

/**
 * `ymd` moved by `months` calendar months, landing on `dueDay` (default: `ymd`'s own day) or the
 * last day of a shorter month. Anchoring to the plan's due day keeps the dates from drifting:
 * a 31st plan goes Jan 31 → Feb 28 (29 in a leap year) → Mar 31 → Apr 30, never Mar 3 or Mar 28.
 */
export function addEmiMonths(ymd: string, months: number, dueDay?: number | null): string {
  const start = parseYmd(ymd);
  const day = dueDay && dueDay >= 1 && dueDay <= 31 ? Math.floor(dueDay) : start.getUTCDate();
  const monthIndex = start.getUTCFullYear() * 12 + start.getUTCMonth() + months;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12;
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatYmd(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}

/**
 * Build upcoming installment schedule from remaining + installment size + next due.
 * Installments fall on `dueDay` (default: the next due date's day), clamped in short months.
 * Caps at 48 installments.
 */
export function nextDueSchedule(input: {
  remainingMinor: number;
  installmentMinor: number;
  nextDueOn: string;
  dueDay?: number | null;
  maxInstallments?: number;
}): EmiInstallment[] {
  const installment = Math.max(1, Math.floor(input.installmentMinor));
  let remaining = Math.max(0, Math.floor(input.remainingMinor));
  if (remaining === 0) return [];
  const max = Math.min(48, input.maxInstallments ?? 48);
  const out: EmiInstallment[] = [];
  const dueDay = input.dueDay ?? emiDueDayOf(input.nextDueOn);
  for (let i = 0; i < max && remaining > 0; i++) {
    const amount = Math.min(installment, remaining);
    out.push({
      index: i + 1,
      // The first installment is the stored next due date as it is.
      dueOn: i === 0 ? formatYmd(parseYmd(input.nextDueOn)) : addEmiMonths(input.nextDueOn, i, dueDay),
      amountMinor: amount,
    });
    remaining -= amount;
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

/**
 * Days from today to the `YYYY-MM-DD` due date. Today is the calendar day in `timeZone` (the
 * user's; UTC when absent). Negative when overdue.
 */
export function emiDaysUntilDue(
  dueOn: string,
  now: Date = new Date(),
  timeZone?: string | null,
): number {
  const due = parseYmd(dueOn).getTime();
  const start = parseYmd(localDateKey(now, timeZone === undefined ? "UTC" : resolveTimeZone(timeZone))).getTime();
  return Math.ceil((due - start) / 86_400_000);
}

/** True when ACTIVE plan is due within `withinDays` (inclusive) or overdue. */
export function emiDueWithinDays(
  input: { status: string; remainingMinor: number; nextDueOn: string },
  withinDays = 7,
  now: Date = new Date(),
  timeZone?: string | null,
): boolean {
  if (input.status !== "ACTIVE" || input.remainingMinor <= 0) return false;
  const days = emiDaysUntilDue(input.nextDueOn, now, timeZone);
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
  /** The user's zone for "today" (UTC when absent). */
  timeZone?: string | null;
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
      input.timeZone,
    )
  ) {
    return null;
  }
  const days = emiDaysUntilDue(input.nextDueOn, now, input.timeZone);
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

