export const RETURN_DEADLINE_QUEUE = "return-deadline";
export const RETURN_DEADLINE_JOB = "return-deadline-reminder";

export type ReturnDeadlinePayload = {
  returnId: string;
  userId: string;
  windowDeadline: string;
  merchant: string;
  /** Optional item image for rich push (NOTIF-RICH). */
  imageUrl?: string;
  amountMinor?: number;
  currency?: string;
};
