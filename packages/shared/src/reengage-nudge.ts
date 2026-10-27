import { formatMinor, DEFAULT_CURRENCY } from "./money.js";
import { runClosetPushDelivery } from "./closet-push-flow.js";
import type { ClosetRichPush, ProcessPushResult, sendExpoPush } from "./push-delivery.js";

export const FOUND_MONEY_WAITING_EVENT = "FOUND_MONEY_WAITING";
export const WEEKLY_DIGEST_EVENT = "WEEKLY_DIGEST";
export const MONTHLY_DIGEST_EVENT = "MONTHLY_DIGEST";

export const NUDGE_QUEUE = "closet-nudge";
export const FOUND_MONEY_WAITING_JOB = "found-money-waiting";
export const WEEKLY_DIGEST_JOB = "weekly-digest";
export const MONTHLY_DIGEST_JOB = "monthly-digest";

/** ISO week key YYYY-Www for stable BullMQ jobIds. */
export function utcIsoWeekKey(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Thursday in current week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Calendar month key YYYY-MM for monthly P&L digest jobIds. */
export function utcMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function foundMoneyWaitingJobId(userId: string, weekKey: string): string {
  return `found-money:${userId}:${weekKey}`;
}

export function weeklyDigestJobId(userId: string, weekKey: string): string {
  return `digest:${userId}:${weekKey}`;
}

export function monthlyDigestJobId(userId: string, monthKey: string): string {
  return `monthly-digest:${userId}:${monthKey}`;
}

export function foundMoneyWaitingCopy(input: {
  totalMinor: number;
  accountCount: number;
  currency?: string;
}): { title: string; body: string } {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const amount = formatMinor(input.totalMinor, currency);
  const n = input.accountCount;
  const cards =
    n <= 0 ? "your vault" : n === 1 ? "1 gift card" : `${n} gift cards`;
  return {
    title: `${amount} waiting in your vault`,
    body: `Forgotten credit across ${cards}. Tap to spend it before it expires.`,
  };
}

export function weeklyDigestCopy(input: {
  spendMinor: number;
  /** Vault found-money remaining (W026 — “you still have ₹/$X”). */
  stillHaveMinor?: number | null;
  avgCostPerWearMinor?: number | null;
  currency?: string;
}): { title: string; body: string } {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const spend = formatMinor(input.spendMinor, currency);
  const stillHave =
    input.stillHaveMinor != null && input.stillHaveMinor > 0
      ? formatMinor(input.stillHaveMinor, currency)
      : null;
  const cpw =
    input.avgCostPerWearMinor != null && input.avgCostPerWearMinor >= 0
      ? formatMinor(input.avgCostPerWearMinor, currency)
      : null;
  if (stillHave) {
    return {
      title: `You still have ${stillHave}`,
      body: cpw
        ? `Forgotten credit waiting · spent ${spend} · avg cost-per-wear ${cpw}. Open your vault.`
        : `Forgotten credit waiting · spent ${spend} this week. Open your vault.`,
    };
  }
  return {
    title: "Your week in Closet",
    body: cpw
      ? `Spent ${spend} · avg cost-per-wear ${cpw}. Open your P&L.`
      : `Spent ${spend} this week. Open your closet P&L.`,
  };
}

export function monthlyDigestCopy(input: {
  spendMinor: number;
  avgCostPerWearMinor?: number | null;
  monthLabel?: string;
  currency?: string;
}): { title: string; body: string } {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const spend = formatMinor(input.spendMinor, currency);
  const month = input.monthLabel?.trim() || "this month";
  const cpw =
    input.avgCostPerWearMinor != null && input.avgCostPerWearMinor >= 0
      ? formatMinor(input.avgCostPerWearMinor, currency)
      : null;
  return {
    title: `Your ${month} closet P&L`,
    body: cpw
      ? `Spent ${spend} · avg cost-per-wear ${cpw}. See the full digest.`
      : `Spent ${spend} in ${month}. Open your wardrobe accountant.`,
  };
}

export type ReengageDeliveryDeps = {
  /** `user.prefs` (C2) and `user.timeZone` (C1). */
  prefs: Record<string, unknown> | null | undefined;
  timeZone: string | null | undefined;
  pushToken: string | null | undefined;
  recentCategoryCount: number;
  now?: Date;
  sendExpo?: typeof sendExpoPush;
  insertQueued: (row: {
    title: string;
    body: string;
    payload: Record<string, unknown>;
  }) => Promise<{ id: string; status?: "QUEUED" | "SENT" | "FAILED" }>;
  markStatus: (
    id: string,
    status: "SENT" | "FAILED",
    expoTicketId?: string | null,
  ) => Promise<void>;
};

/**
 * Re-engagement: found-money waiting (credits category, frequency-capped).
 * Skips when totalMinor <= 0.
 */
export async function deliverFoundMoneyWaiting(
  input: {
    totalMinor: number;
    accountCount: number;
    currency?: string;
  } & ReengageDeliveryDeps,
): Promise<ProcessPushResult> {
  if (input.totalMinor <= 0) {
    return { status: "skipped" };
  }
  const copy = foundMoneyWaitingCopy(input);
  const rich: ClosetRichPush = {
    amountMinor: input.totalMinor,
    currency: input.currency ?? DEFAULT_CURRENCY,
  };
  return runClosetPushDelivery({
    eventType: FOUND_MONEY_WAITING_EVENT,
    prefs: input.prefs,
    timeZone: input.timeZone,
    pushToken: input.pushToken,
    title: copy.title,
    body: copy.body,
    rich,
    payloadExtra: {
      totalMinor: input.totalMinor,
      accountCount: input.accountCount,
      currency: rich.currency,
    },
    recentCategoryCount: input.recentCategoryCount,
    now: input.now,
    sendExpo: input.sendExpo,
    insertQueued: input.insertQueued,
    markStatus: input.markStatus,
  });
}

/**
 * Weekly closet digest (digest category, capped to 1/week by default).
 */
export async function deliverWeeklyDigest(
  input: {
    spendMinor: number;
    stillHaveMinor?: number | null;
    avgCostPerWearMinor?: number | null;
    currency?: string;
  } & ReengageDeliveryDeps,
): Promise<ProcessPushResult> {
  const copy = weeklyDigestCopy(input);
  const stillHave =
    input.stillHaveMinor != null && input.stillHaveMinor > 0
      ? input.stillHaveMinor
      : null;
  const rich: ClosetRichPush = {
    amountMinor: stillHave ?? input.spendMinor,
    currency: input.currency ?? DEFAULT_CURRENCY,
  };
  return runClosetPushDelivery({
    eventType: WEEKLY_DIGEST_EVENT,
    prefs: input.prefs,
    timeZone: input.timeZone,
    pushToken: input.pushToken,
    title: copy.title,
    body: copy.body,
    rich,
    payloadExtra: {
      spendMinor: input.spendMinor,
      stillHaveMinor: stillHave,
      avgCostPerWearMinor: input.avgCostPerWearMinor ?? null,
      currency: rich.currency,
    },
    recentCategoryCount: input.recentCategoryCount,
    now: input.now,
    sendExpo: input.sendExpo,
    insertQueued: input.insertQueued,
    markStatus: input.markStatus,
  });
}

/**
 * Monthly closet P&L digest (WV-08) — spend + CPW highlight.
 * Uses digest category; schedule once per UTC month via monthlyDigestJobId.
 */
export async function deliverMonthlyDigest(
  input: {
    spendMinor: number;
    avgCostPerWearMinor?: number | null;
    monthLabel?: string;
    currency?: string;
  } & ReengageDeliveryDeps,
): Promise<ProcessPushResult> {
  const copy = monthlyDigestCopy(input);
  const rich: ClosetRichPush = {
    amountMinor: input.spendMinor,
    currency: input.currency ?? DEFAULT_CURRENCY,
  };
  return runClosetPushDelivery({
    eventType: MONTHLY_DIGEST_EVENT,
    prefs: input.prefs,
    timeZone: input.timeZone,
    pushToken: input.pushToken,
    title: copy.title,
    body: copy.body,
    rich,
    deepLinkExtra: {
      monthLabel: input.monthLabel,
    },
    payloadExtra: {
      spendMinor: input.spendMinor,
      avgCostPerWearMinor: input.avgCostPerWearMinor ?? null,
      monthLabel: input.monthLabel ?? null,
      currency: rich.currency,
    },
    recentCategoryCount: input.recentCategoryCount,
    now: input.now,
    sendExpo: input.sendExpo,
    insertQueued: input.insertQueued,
    markStatus: input.markStatus,
  });
}
