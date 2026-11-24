/**
 * U049 — Occasion gift deadline board: shortlist 3 + budget lock + T-7/T-2.
 */

import type { GiftBudgetLockRecord, Repositories } from "./repositories/types.js";

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

function lockKey(recipientId: string, occasion: string, day: string): string {
  return `${recipientId}:${occasion}:${day}`;
}

function toGiftBudgetLock(r: GiftBudgetLockRecord): GiftBudgetLock {
  return {
    recipientId: r.recipientId,
    occasion: r.occasion,
    date: r.occasionDate.toISOString(),
    budgetLockMinor: r.budgetLockMinor,
    currency: r.currency,
    lockedAt: r.lockedAt.toISOString(),
    shortlistIds: [...r.shortlistIds],
  };
}

/**
 * Stores the lock in `gift_budget_locks` (one per recipient, occasion and day; a repeat replaces
 * it). null when the recipient is not the user's.
 */
export async function setGiftBudgetLock(
  repos: Pick<Repositories, "upsertGiftBudgetLock">,
  userId: string,
  input: {
    recipientId: string;
    occasion: string;
    date: string;
    budgetLockMinor: number;
    currency?: string;
    shortlistIds?: string[];
    now?: Date;
  },
): Promise<GiftBudgetLock | null> {
  const row = await repos.upsertGiftBudgetLock({
    userId,
    recipientId: input.recipientId,
    occasion: input.occasion,
    occasionDay: input.date.slice(0, 10),
    occasionDate: new Date(input.date),
    budgetLockMinor: Math.max(0, Math.trunc(input.budgetLockMinor)),
    currency: input.currency ?? "INR",
    shortlistIds: (input.shortlistIds ?? []).slice(0, 3),
    lockedAt: input.now ?? new Date(),
  });
  return row ? toGiftBudgetLock(row) : null;
}

/** The user's locks, keyed for `buildGiftDeadlineBoard`. */
export async function listGiftBudgetLocks(
  repos: Pick<Repositories, "listGiftBudgetLocks">,
  userId: string,
): Promise<GiftBudgetLock[]> {
  return (await repos.listGiftBudgetLocks(userId)).map(toGiftBudgetLock);
}

/** Today's calendar date where the user is, as UTC midnight of that date (ms). */
function startOfTodayIn(timeZone: string, now: Date): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  } catch {
    // An unknown zone name: count from the UTC date rather than fail the board.
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

/**
 * Whole days from the user's today to an occasion. The occasion is a calendar day (stored as UTC
 * midnight of that date); "today" is the date on the user's own clock, so late at night in India
 * the count doesn't run a day ahead of what the calendar on the wall says.
 */
export function daysUntil(dateIso: string, timeZone = "UTC", now: Date = new Date()): number {
  const raw = new Date(dateIso);
  if (Number.isNaN(raw.getTime())) return 0;
  const target = Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  return Math.max(0, Math.round((target - startOfTodayIn(timeZone, now)) / 86_400_000));
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
  locks: GiftBudgetLock[],
  now: Date = new Date(),
  /** The user's IANA time zone (users.time_zone): days are counted from their today. */
  timeZone = "UTC",
): GiftDeadlineBoardRow[] {
  const byKey = new Map(locks.map((l) => [lockKey(l.recipientId, l.occasion, l.date.slice(0, 10)), l]));
  const out: GiftDeadlineBoardRow[] = [];
  for (const r of rows) {
    const days = daysUntil(r.date, timeZone, now);
    const lock = byKey.get(lockKey(r.recipientId, r.occasion, r.date.slice(0, 10)));
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
