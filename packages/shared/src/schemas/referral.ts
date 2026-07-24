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

export type ReferralCodeResponse = z.infer<typeof ReferralCodeResponseSchema>;
export type ApplyReferralBody = z.infer<typeof ApplyReferralBodySchema>;
export type ApplyReferralResponse = z.infer<typeof ApplyReferralResponseSchema>;
