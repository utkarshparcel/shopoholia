export const GIFT_OCCASION_QUEUE = "gift-occasion";
export const GIFT_OCCASION_JOB = "gift-occasion-reminder";
export type GiftOccasionPayload = {
  userId: string;
  recipientId: string;
  occasion: string;
  date: string;
  label?: string;
  recipientName?: string;
  ideaCount?: number;
};

export const TAILORING_QUEUE = "tailoring-orders";
export const TAILORING_JOB = "tailoring-state-transition";
export type TailoringPayload = {
  orderId: string;
  userId: string;
};
