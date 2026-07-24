import { z } from "zod";

export const CashbackEventSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid().nullable(),
  platform: z.string(),
  coinsEarned: z.number().int().nonnegative(),
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
  createdAt: z.string().datetime(),
});

export const CashbackHistoryResponseSchema = z.object({
  events: z.array(CashbackEventSchema),
  totalEarned: z.number().int().nonnegative(),
});

export const CashbackWebhookBodySchema = z.object({
  clickId: z.string(),
  status: z.enum(["CONFIRMED", "REJECTED"]),
  orderId: z.string().optional(),
});

export type CashbackEvent = z.infer<typeof CashbackEventSchema>;
export type CashbackHistoryResponse = z.infer<typeof CashbackHistoryResponseSchema>;
export type CashbackWebhookBody = z.infer<typeof CashbackWebhookBodySchema>;
