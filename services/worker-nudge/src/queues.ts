export const NUDGE_QUEUE = "closet-nudge";
export const FOUND_MONEY_WAITING_JOB = "found-money-waiting";
export const WEEKLY_DIGEST_JOB = "weekly-digest";
export const MONTHLY_DIGEST_JOB = "monthly-digest";

export type FoundMoneyWaitingPayload = {
  userId: string;
  totalMinor: number;
  accountCount: number;
  currency?: string;
};

export type WeeklyDigestPayload = {
  userId: string;
  spendMinor: number;
  avgCostPerWearMinor?: number | null;
  currency?: string;
};

export type MonthlyDigestPayload = {
  userId: string;
  spendMinor: number;
  avgCostPerWearMinor?: number | null;
  monthLabel?: string;
  currency?: string;
};
