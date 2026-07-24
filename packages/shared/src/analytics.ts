import { z } from "zod";

/** Phase I funnel events — wire to PostHog/Mixpanel in production. */
export const ANALYTICS_EVENTS = [
  "install",
  "avatar_complete",
  "add_to_cart",
  "checkout",
  "wait_complete",
  "reveal_opened",
  "reveal_rated",
  "unlock",
  "share",
  "affiliate_click",
  "iap_purchase",
  "generate_render",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const AnalyticsEventNameSchema = z.enum(ANALYTICS_EVENTS);

export const RevealRatingSchema = z.enum(["loved", "ok", "meh"]);

export type RevealRating = z.infer<typeof RevealRatingSchema>;

export const RevealRatingBodySchema = z.object({
  rating: RevealRatingSchema,
});

export type RevealRatingBody = z.infer<typeof RevealRatingBodySchema>;

export const RevealRatingResponseSchema = z.object({
  orderId: z.string().uuid(),
  rating: RevealRatingSchema,
  recorded: z.literal(true),
});

export type RevealRatingResponse = z.infer<typeof RevealRatingResponseSchema>;

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  properties?: AnalyticsProperties;
  timestamp?: string;
};
