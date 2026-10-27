import { z } from "zod";

export const CashbackClaimStatusSchema = z.enum(["UNCLAIMED", "CLAIMED", "EXPIRED"]);
export type CashbackClaimStatus = z.infer<typeof CashbackClaimStatusSchema>;

export const CashbackClaimSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  /** Card / bank / portal that owes the cashback. */
  source: z.string().min(1),
  merchant: z.string().nullable(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string(),
  expiresAt: z.string().datetime().nullable(),
  status: CashbackClaimStatusSchema,
  notes: z.string().nullable(),
  /** Optional claim-start URL (portal / mailto). Manual tracker — not a bank partner. */
  claimUrl: z.string().url().nullable().optional(),
  claimedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateCashbackClaimBodySchema = z.object({
  source: z.string().min(1).max(120),
  merchant: z.string().max(120).nullable().optional(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  claimUrl: z.string().url().nullable().optional(),
});

export const CashbackClaimListResponseSchema = z.object({
  claims: z.array(CashbackClaimSchema),
});

export type CashbackClaim = z.infer<typeof CashbackClaimSchema>;
export type CreateCashbackClaimBody = z.infer<typeof CreateCashbackClaimBodySchema>;
export type CashbackClaimListResponse = z.infer<typeof CashbackClaimListResponseSchema>;
