/**
 * U049 — Occasion gift deadline board: shortlist 3 + budget lock + T-7/T-2.
 */

export const GIFT_DEADLINE_LEAD_DAYS = [7, 2] as const;

export type GiftBudgetLock = {
  recipientId: string;
  occasion: string;
  date: string;
  budgetLockMinor: number;
  currency: string;
  lockedAt: string;
  shortlistIds: string[];
};

export type GiftDeadlineBoardRow = {
  recipientId: string;
  recipientName: string;
  occasion: string;
  label: string;
  date: string;
  daysUntil: number;
  budgetLockMinor: number | null;
  currency: string | null;
  shortlistCount: number;
  reminderLeads: number[];
};

const locks = new Map<string, GiftBudgetLock>();

function lockKey(recipientId: string, occasion: string, date: string): string {
  return `${recipientId}:${occasion}:${date.slice(0, 10)}`;
}

export function setGiftBudgetLock(input: {
  recipientId: string;
  occasion: string;
  date: string;
  budgetLockMinor: number;
  currency?: string;
  shortlistIds?: string[];
  now?: Date;
}): GiftBudgetLock {
  const row: GiftBudgetLock = {
    recipientId: input.recipientId,
    occasion: input.occasion,
    date: input.date,
    budgetLockMinor: Math.max(0, Math.trunc(input.budgetLockMinor)),
    currency: input.currency ?? "INR",
    lockedAt: (input.now ?? new Date()).toISOString(),
    shortlistIds: (input.shortlistIds ?? []).slice(0, 3),
  };
  locks.set(lockKey(row.recipientId, row.occasion, row.date), row);
  return row;
}

export function getGiftBudgetLock(
  recipientId: string,
  occasion: string,
  date: string,
): GiftBudgetLock | null {
  return locks.get(lockKey(recipientId, occasion, date)) ?? null;
}

export function clearGiftBudgetLocks(): void {
  locks.clear();
}

export function utcDaysUntil(dateIso: string, now: Date = new Date()): number {
  const raw = new Date(dateIso);
  if (Number.isNaN(raw.getTime())) return 0;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  return Math.max(0, Math.round((target - startOfToday) / 86_400_000));
}

/**
 * Delay until (occasion − leadDays). Null when past. Inside window → 100ms.
 */
export function computeGiftDeadlineReminderDelayMs(
  occasionDate: Date | string,
  leadDays: number,
  now: Date | number = new Date(),
): number | null {
  const occasionMs = new Date(occasionDate).getTime();
  if (Number.isNaN(occasionMs)) return null;
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (occasionMs <= nowMs) return null;
  const delayMs = occasionMs - leadDays * 86_400_000 - nowMs;
  return delayMs <= 0 ? 100 : delayMs;
}

export function giftDeadlineReminderJobId(
  recipientId: string,
  occasion: string,
  date: string,
  leadDays: number,
): string {
  return `gift-deadline:${recipientId}:${occasion}:${date.slice(0, 10)}:T-${leadDays}`;
}

/** Build deadline board from recipients + locks (shortlist capped at 3). */
export function buildGiftDeadlineBoard(
  rows: Array<{
    recipientId: string;
    recipientName: string;
    occasion: string;
    label?: string | null;
    date: string;
  }>,
  now: Date = new Date(),
): GiftDeadlineBoardRow[] {
  const out: GiftDeadlineBoardRow[] = [];
  for (const r of rows) {
    const days = utcDaysUntil(r.date, now);
    const lock = getGiftBudgetLock(r.recipientId, r.occasion, r.date);
    out.push({
      recipientId: r.recipientId,
      recipientName: r.recipientName,
      occasion: r.occasion,
      label: r.label?.trim() || r.occasion,
      date: r.date,
      daysUntil: days,
      budgetLockMinor: lock?.budgetLockMinor ?? null,
      currency: lock?.currency ?? null,
      shortlistCount: lock?.shortlistIds.length ?? 0,
      reminderLeads: [...GIFT_DEADLINE_LEAD_DAYS],
    });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Cap shortlist to 3 idea ids under a budget lock. */
export function lockShortlistOfThree(
  ideaIds: string[],
  budgetLockMinor: number,
): { shortlistIds: string[]; budgetLockMinor: number } {
  return {
    shortlistIds: ideaIds.filter(Boolean).slice(0, 3),
    budgetLockMinor: Math.max(0, Math.trunc(budgetLockMinor)),
  };
}
