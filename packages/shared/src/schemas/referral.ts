import { z } from "zod";

export const ReferralCodeResponseSchema = z.object({
  referralCode: z.string(),
  referredCount: z.number().int().nonnegative(),
  earnedCoins: z.number().int().nonnegative(),
});

export const ApplyReferralBodySchema = z.object({
  referralCode: z.string().min(4).max(20),
});

export const ApplyReferralResponseSchema = z.object({
  applied: z.literal(true),
  referrerName: z.string().nullable(),
});

/** N36 — log attribution when a family share deep link is opened. */
export const AttributeReferralBodySchema = z.object({
  referralCode: z.string().min(4).max(20),
  source: z.enum(["family_share", "deep_link", "other"]).optional().default("family_share"),
});

/** W094 — landing microcopy on worn.app/r/{code}. */
export const ReferralLandingCopySchema = z.object({
  headline: z.string().min(1),
  body: z.string().min(1),
  installCta: z.string().min(1),
  installHint: z.string().min(1),
  referralCode: z.string().min(1),
});

export const AttributeReferralResponseSchema = z.object({
  attributed: z.boolean(),
  referralCode: z.string(),
  deepLink: z.string().nullable(),
  landing: ReferralLandingCopySchema,
});

export type ReferralCodeResponse = z.infer<typeof ReferralCodeResponseSchema>;
export type ApplyReferralBody = z.infer<typeof ApplyReferralBodySchema>;
export type ApplyReferralResponse = z.infer<typeof ApplyReferralResponseSchema>;
export type AttributeReferralBody = z.infer<typeof AttributeReferralBodySchema>;
export type AttributeReferralResponse = z.infer<typeof AttributeReferralResponseSchema>;
export type ReferralLandingCopyResponse = z.infer<typeof ReferralLandingCopySchema>;
