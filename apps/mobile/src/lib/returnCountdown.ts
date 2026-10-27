/** Days left until a return window closes. Calm, money-clear copy. */

export type ReturnCountdown = {
  daysLeft: number;
  /** Whole hours remaining when under 24h (else null). */
  hoursLeft: number | null;
  expired: boolean;
  /** e.g. "3 days left", "5 hours left", "Expired" */
  label: string;
  /** Urgent when ≤3 days and not expired */
  urgent: boolean;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function returnCountdown(
  deadline: string | Date,
  now: Date = new Date(),
): ReturnCountdown {
  const ms = new Date(deadline).getTime() - now.getTime();
  if (ms <= 0) {
    return {
      daysLeft: 0,
      hoursLeft: 0,
      expired: true,
      label: 'Expired',
      urgent: false,
    };
  }
  const daysLeft = Math.ceil(ms / DAY_MS);
  if (ms < DAY_MS) {
    const hoursLeft = Math.max(1, Math.ceil(ms / HOUR_MS));
    const label = hoursLeft === 1 ? '1 hour left' : `${hoursLeft} hours left`;
    return {
      daysLeft: 1,
      hoursLeft,
      expired: false,
      label,
      urgent: true,
    };
  }
  const label = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  return {
    daysLeft,
    hoursLeft: null,
    expired: false,
    label,
    urgent: daysLeft <= 3,
  };
}

/** Concierge line: "3 days left to return that jacket — tap to start." */
export function returnConciergeCopy(input: {
  deadline: string | Date;
  itemTitle?: string | null;
  merchant?: string | null;
  now?: Date;
}): string {
  const c = returnCountdown(input.deadline, input.now);
  if (c.expired) {
    const what = input.itemTitle?.trim() || input.merchant?.trim() || 'this item';
    return `Return window closed for ${what}.`;
  }
  const what =
    input.itemTitle?.trim() ||
    (input.merchant ? `your ${input.merchant} order` : 'that item');
  return `${c.label} to return ${what} — tap to start.`;
}
