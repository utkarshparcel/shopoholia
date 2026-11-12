import { z } from "zod";
import { WardrobeItemSchema } from "./wardrobe.js";

export const HouseholdRoleSchema = z.enum(["OWNER", "MEMBER"]);
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;

export const HouseholdMemberSchema = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  userId: z.string().uuid(),
  role: HouseholdRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;

export const HouseholdSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  ownerId: z.string().uuid(),
  inviteCode: z.string().min(4).max(16),
  memberCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Household = z.infer<typeof HouseholdSchema>;

export const CreateHouseholdBodySchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateHouseholdBody = z.infer<typeof CreateHouseholdBodySchema>;

export const JoinHouseholdBodySchema = z.object({
  inviteCode: z.string().min(4).max(16),
});
export type JoinHouseholdBody = z.infer<typeof JoinHouseholdBodySchema>;

export const HouseholdListResponseSchema = z.object({
  households: z.array(HouseholdSchema),
});
export type HouseholdListResponse = z.infer<typeof HouseholdListResponseSchema>;

export const HouseholdDetailResponseSchema = z.object({
  household: HouseholdSchema,
  members: z.array(HouseholdMemberSchema),
  role: HouseholdRoleSchema,
});
export type HouseholdDetailResponse = z.infer<typeof HouseholdDetailResponseSchema>;

export const HouseholdInviteResponseSchema = z.object({
  inviteCode: z.string().min(4).max(16),
  inviteUrl: z.string().url(),
  deepLink: z.string().min(1),
});
export type HouseholdInviteResponse = z.infer<typeof HouseholdInviteResponseSchema>;

export const HouseholdWardrobeResponseSchema = z.object({
  householdId: z.string().uuid(),
  items: z.array(WardrobeItemSchema),
});
export type HouseholdWardrobeResponse = z.infer<typeof HouseholdWardrobeResponseSchema>;

export const PatchHouseholdWardrobeBodySchema = z
  .object({
    laundryStatus: z.enum(["CLEAN", "DIRTY", "IN_LAUNDRY"]).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field required" });
export type PatchHouseholdWardrobeBody = z.infer<typeof PatchHouseholdWardrobeBodySchema>;

/** U015 — shared vault ACL (view-only default). */
export const HouseholdVaultAccessSchema = z.enum(["VIEW", "SPEND"]);
export type HouseholdVaultAccessDto = z.infer<typeof HouseholdVaultAccessSchema>;

/** ISO 4217 code, e.g. "INR". */
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, "a 3-letter ISO currency code");

export const HouseholdVaultMemberSettingsSchema = z.object({
  userId: z.string().uuid(),
  vaultAccess: HouseholdVaultAccessSchema,
  spendCapMinor: z.number().int().nonnegative().nullable(),
  /** The cap's currency; spends against credits in another currency are refused. */
  spendCapCurrency: CurrencyCodeSchema.nullable().optional(),
  spentMinor: z.number().int().nonnegative().optional().default(0),
});
export type HouseholdVaultMemberSettings = z.infer<
  typeof HouseholdVaultMemberSettingsSchema
>;

export const HouseholdVaultAccountSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  merchant: z.string(),
  kind: z.string(),
  currency: z.string(),
  balanceCacheMinor: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable(),
});
export type HouseholdVaultAccountDto = z.infer<typeof HouseholdVaultAccountSchema>;

export const HouseholdVaultResponseSchema = z.object({
  householdId: z.string().uuid(),
  myAccess: HouseholdVaultAccessSchema,
  mySpendCapMinor: z.number().int().nonnegative().nullable(),
  mySpendCapCurrency: CurrencyCodeSchema.nullable().optional(),
  mySpentMinor: z.number().int().nonnegative(),
  accounts: z.array(HouseholdVaultAccountSchema),
  members: z.array(HouseholdVaultMemberSettingsSchema).optional(),
});
export type HouseholdVaultResponse = z.infer<typeof HouseholdVaultResponseSchema>;

export const PatchHouseholdVaultMemberBodySchema = z.object({
  userId: z.string().uuid(),
  vaultAccess: HouseholdVaultAccessSchema.optional(),
  spendCapMinor: z.number().int().nonnegative().nullable().optional(),
  /**
   * The cap's currency. Without it a new cap takes the currency of the owner's shared credits
   * when they all share one; otherwise the request is refused.
   */
  spendCapCurrency: CurrencyCodeSchema.optional(),
});
export type PatchHouseholdVaultMemberBody = z.infer<
  typeof PatchHouseholdVaultMemberBodySchema
>;

export const HouseholdVaultSpendBodySchema = z.object({
  accountId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});
export type HouseholdVaultSpendBody = z.infer<typeof HouseholdVaultSpendBodySchema>;

export const HouseholdVaultSpendResponseSchema = z.object({
  balanceMinor: z.number().int().nonnegative(),
  spentMinor: z.number().int().nonnegative(),
  remainingCapMinor: z.number().int().nonnegative().nullable(),
});
export type HouseholdVaultSpendResponse = z.infer<
  typeof HouseholdVaultSpendResponseSchema
>;
