import { z } from "zod";

export const BudgetCategorySchema = z.enum(["APPAREL", "FOOTWEAR", "ACCESSORIES", "BEAUTY", "GENERAL"]);
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;

export const BudgetPeriodSchema = z.enum(["MONTHLY", "QUARTERLY"]);
export type BudgetPeriod = z.infer<typeof BudgetPeriodSchema>;

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  category: BudgetCategorySchema,
  period: BudgetPeriodSchema,
  limitMinor: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const CreateBudgetBodySchema = z.object({
  category: BudgetCategorySchema,
  period: BudgetPeriodSchema,
  limitMinor: z.number().int().positive(),
});
export type CreateBudgetBody = z.infer<typeof CreateBudgetBodySchema>;

export const BudgetsResponseSchema = z.object({
  budgets: z.array(BudgetSchema),
});
export type BudgetsResponse = z.infer<typeof BudgetsResponseSchema>;

export const SpendRollupSchema = z.object({
  period: z.string(),
  category: z.string(),
  totalMinor: z.number().int().nonnegative(),
});
export type SpendRollup = z.infer<typeof SpendRollupSchema>;

/** Per-item cost-per-wear goal progress (N41-CPW-GOALS). */
export const CpwGoalSchema = z.object({
  active: z.boolean(),
  targetCpwMinor: z.number().int().positive().nullable(),
  currentCpwMinor: z.number().int().nonnegative().nullable(),
  costMinor: z.number().int().nonnegative(),
  wearCount: z.number().int().nonnegative(),
  wearsNeeded: z.number().int().nonnegative(),
  progress: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  completed: z.boolean(),
  label: z.string(),
});
export type CpwGoal = z.infer<typeof CpwGoalSchema>;

export const SetCpwGoalBodySchema = z.object({
  targetCpwMinor: z.number().int().positive(),
});
export type SetCpwGoalBody = z.infer<typeof SetCpwGoalBodySchema>;

export const CpwGoalItemSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  brand: z.string().nullable().optional(),
  category: z.string().optional(),
  costMinor: z.number().int().nonnegative(),
  cpwGoal: CpwGoalSchema,
});
export type CpwGoalItem = z.infer<typeof CpwGoalItemSchema>;

export const SetCpwGoalResponseSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  targetCpwMinor: z.number().int().positive(),
  cpwGoal: CpwGoalSchema,
  pushQueued: z.boolean().optional().default(false),
});
export type SetCpwGoalResponse = z.infer<typeof SetCpwGoalResponseSchema>;

export const CpwGoalsResponseSchema = z.object({
  goals: z.array(CpwGoalItemSchema),
});
export type CpwGoalsResponse = z.infer<typeof CpwGoalsResponseSchema>;

export const AccountantSummarySchema = z.object({
  /** Current calendar month label, e.g. "2026-08" — monthly closet P&L digest. */
  monthLabel: z.string().min(1),
  /** Spend in the current calendar month only. */
  monthlySpendMinor: z.number().int().nonnegative(),
  totalSpendMinor: z.number().int().nonnegative(),
  spendByCategory: z.array(SpendRollupSchema),
  /** Alias exposed for digests; same value as avgCostPerWearMinor. */
  costPerWearMinor: z.number().int().nullable(),
  avgCostPerWearMinor: z.number().int().nullable(),
  budgets: z.array(
    z.object({
      category: BudgetCategorySchema,
      period: BudgetPeriodSchema,
      limitMinor: z.number().int().nonnegative(),
      actualMinor: z.number().int().nonnegative(),
      exceeded: z.boolean(),
      /** N42 — OK under 80%, WARN at mid-period 80% threshold, EXCEEDED over cap. */
      envelopeStatus: z.enum(["OK", "WARN", "EXCEEDED"]),
      alertThresholdHit: z.boolean(),
    }),
  ),
  /** Active cost-per-wear goals (items with a target set). */
  cpwGoals: z.array(CpwGoalItemSchema).optional().default([]),
  /** N21 — all-time repair & alteration spend. */
  repairSpendMinor: z.number().int().nonnegative().optional().default(0),
  /** N21 — repair spend in the current calendar month. */
  monthlyRepairSpendMinor: z.number().int().nonnegative().optional().default(0),
});
export type AccountantSummary = z.infer<typeof AccountantSummarySchema>;

export const AccountantLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["PURCHASE", "LEDGER", "REPAIR"]),
  description: z.string(),
  amountMinor: z.number().int(),
  createdAt: z.string().datetime(),
  refId: z.string().uuid().nullable().optional(),
  /** Ledger refType when kind=LEDGER (e.g. return.refund:UPI for U012 filter). */
  refType: z.string().nullable().optional(),
});
export type AccountantLedgerEntry = z.infer<typeof AccountantLedgerEntrySchema>;

export const AccountantLedgerResponseSchema = z.object({
  entries: z.array(AccountantLedgerEntrySchema),
  /** C3 paging: pass back as `?cursor=` for the next (older) page; null on the last page. */
  nextCursor: z.string().nullable().optional(),
});
export type AccountantLedgerResponse = z.infer<typeof AccountantLedgerResponseSchema>;

/** India closet seasons for wardrobe ROI reports (N43). */
export const ClosetSeasonSchema = z.enum(["SUMMER", "MONSOON", "WINTER"]);
export type ClosetSeason = z.infer<typeof ClosetSeasonSchema>;

export const SeasonRoiRowSchema = z.object({
  season: ClosetSeasonSchema,
  label: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
  wears: z.number().int().nonnegative(),
  itemsWorn: z.number().int().nonnegative(),
  costWornMinor: z.number().int().nonnegative(),
  costIdleMinor: z.number().int().nonnegative(),
  itemsIdle: z.number().int().nonnegative(),
  costPerWearMinor: z.number().int().nullable(),
});
export type SeasonRoiRow = z.infer<typeof SeasonRoiRowSchema>;

export const AccountantSeasonRoiSchema = z.object({
  year: z.number().int(),
  seasons: z.array(SeasonRoiRowSchema),
  totalWears: z.number().int().nonnegative(),
  totalCostWornMinor: z.number().int().nonnegative(),
  totalCostIdleMinor: z.number().int().nonnegative(),
});
export type AccountantSeasonRoi = z.infer<typeof AccountantSeasonRoiSchema>;

/** N44 — workwear tax pack (yearly invoices + spend). */
export const TaxPackSpendRowSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  category: z.string(),
  brand: z.string().nullable(),
  costMinor: z.number().int().nonnegative(),
  purchasedAt: z.string().datetime(),
  tags: z.array(z.string()),
});
export type TaxPackSpendRow = z.infer<typeof TaxPackSpendRowSchema>;

export const TaxPackInvoiceRowSchema = z.object({
  receiptId: z.string().uuid(),
  merchant: z.string(),
  purchasedAt: z.string().datetime(),
  totalMinor: z.number().int().nonnegative(),
  gstin: z.string().nullable(),
  purchaseId: z.string().uuid().nullable(),
  imageKey: z.string(),
});
export type TaxPackInvoiceRow = z.infer<typeof TaxPackInvoiceRowSchema>;

export const TaxPackResponseSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  label: z.string().min(1),
  year: z.number().int().nullable(),
  totalSpendMinor: z.number().int().nonnegative(),
  spendRowCount: z.number().int().nonnegative(),
  invoiceCount: z.number().int().nonnegative(),
  spend: z.array(TaxPackSpendRowSchema),
  invoices: z.array(TaxPackInvoiceRowSchema),
  spendCsv: z.string(),
  invoicesCsv: z.string(),
});
export type TaxPackResponse = z.infer<typeof TaxPackResponseSchema>;
