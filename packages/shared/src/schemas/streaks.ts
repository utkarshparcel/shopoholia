import { z } from "zod";

export const StreakResponseSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  lastClaimedAt: z.string().datetime().nullable(),
  todayClaimed: z.boolean(),
  nextRewardCoins: z.number().int().positive(),
  nextRewardDay: z.number().int().positive(),
});

export const StreakClaimResponseSchema = z.object({
  claimed: z.literal(true),
  coinsGranted: z.number().int().positive(),
  currentStreak: z.number().int().nonnegative(),
  balanceAfter: z.number().int().nonnegative(),
});

export type StreakResponse = z.infer<typeof StreakResponseSchema>;
export type StreakClaimResponse = z.infer<typeof StreakClaimResponseSchema>;
