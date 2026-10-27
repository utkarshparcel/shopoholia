import { z } from "zod";

export const ExchangeWindowSchema = z.object({
  purchaseId: z.string().uuid(),
  merchant: z.string(),
  orderRef: z.string().nullable(),
  purchasedAt: z.string().datetime(),
  returnWindowDeadline: z.string().datetime().nullable(),
  exchangeWindowDeadline: z.string().datetime().nullable(),
  /** True when exchange window differs from return window for this merchant. */
  windowsDiffer: z.boolean(),
  daysLeftExchange: z.number().int().nullable(),
  daysLeftReturn: z.number().int().nullable(),
  itemTitles: z.array(z.string()).optional(),
});
export type ExchangeWindow = z.infer<typeof ExchangeWindowSchema>;

export const ExchangeWindowsListResponseSchema = z.object({
  exchanges: z.array(ExchangeWindowSchema),
});
export type ExchangeWindowsListResponse = z.infer<
  typeof ExchangeWindowsListResponseSchema
>;
