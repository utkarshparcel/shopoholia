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

/** MON-AFFILIATE-CLOSET — Closet CTA sources that write cashback_events. */
export const ClosetAffiliateSourceSchema = z.enum([
  "vault_use_it_now",
  "use_this_weekend",
  "replace_twin",
  "missing_piece",
  "complete_look",
]);
export type ClosetAffiliateSource = z.infer<typeof ClosetAffiliateSourceSchema>;

/**
 * Play listing clicks require listingId.
 * Closet CTAs may omit listingId (e.g. vault Use it now merchant deep-link).
 */
export const CashbackClickBodySchema = z
  .object({
    listingId: z.string().uuid().nullable().optional(),
    platform: z.string().min(1),
    clickId: z.string().min(1).optional(),
    source: z.union([z.literal("play_listing"), ClosetAffiliateSourceSchema]).optional(),
    url: z.string().url().optional(),
  })
  .superRefine((body, ctx) => {
    const source = body.source ?? "play_listing";
    if (source === "play_listing" && !body.listingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "listingId is required for play_listing clicks",
        path: ["listingId"],
      });
    }
  });
export type CashbackClickBody = z.infer<typeof CashbackClickBodySchema>;

export const CashbackClickResponseSchema = z.object({
  recorded: z.literal(true),
  clickId: z.string(),
  source: z.string(),
  platform: z.string(),
  listingId: z.string().uuid().nullable(),
});
export type CashbackClickResponse = z.infer<typeof CashbackClickResponseSchema>;

export type CashbackEvent = z.infer<typeof CashbackEventSchema>;
export type CashbackHistoryResponse = z.infer<typeof CashbackHistoryResponseSchema>;
export type CashbackWebhookBody = z.infer<typeof CashbackWebhookBodySchema>;
