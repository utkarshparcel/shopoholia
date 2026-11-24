export const RETURN_DEADLINE_QUEUE = "return-deadline";
export const RETURN_DEADLINE_JOB = "return-deadline-reminder";

export type ReturnDeadlinePayload = {
  returnId: string;
  userId: string;
  windowDeadline: string;
  merchant: string;
  /** Long-lived image URL for rich push (the brand placeholder) (NOTIF-RICH). */
  imageUrl?: string;
  /** Storage key of the item image: signed here, when the push is sent. */
  imageKey?: string;
  amountMinor?: number;
  currency?: string;
};
