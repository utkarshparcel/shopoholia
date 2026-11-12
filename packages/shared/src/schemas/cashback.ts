import { z } from "zod";

export const CashbackEventSchema = z.object({
  id: z.uuid(),
  listingId: z.uuid().nullable(),
  platform: z.string(),
  coinsEarned: z.number().int().nonnegative(),
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
  createdAt: z.iso.datetime(),
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
    listingId: z.uuid().nullable().optional(),
    platform: z.string().min(1).max(40),
    /** Ignored: the server makes every click id. Accepted so older clients still validate. */
    clickId: z.string().min(1).max(200).optional(),
    source: z.union([z.literal("play_listing"), ClosetAffiliateSourceSchema]).optional(),
    url: z.url().max(2048).optional(),
  })
  .superRefine((body, ctx) => {
    const source = body.source ?? "play_listing";
    if (source === "play_listing" && !body.listingId) {
      ctx.addIssue({
        code: "custom",
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
  listingId: z.uuid().nullable(),
});
export type CashbackClickResponse = z.infer<typeof CashbackClickResponseSchema>;

export type CashbackEvent = z.infer<typeof CashbackEventSchema>;
export type CashbackHistoryResponse = z.infer<typeof CashbackHistoryResponseSchema>;
export type CashbackWebhookBody = z.infer<typeof CashbackWebhookBodySchema>;
