import { z } from "zod";
import {
  MerchantPurchaseItemSchema,
  MerchantPurchaseSchema,
} from "./purchases.js";

/** N50 — body for POST /orders/:id/track-in-closet (order id in path). */
export const TrackPlayBuyBodySchema = z.object({
  /** When true, also seed wardrobe_items linked to purchase lines. */
  seedWardrobe: z.boolean().optional().default(true),
});
export type TrackPlayBuyBody = z.infer<typeof TrackPlayBuyBodySchema>;

/** Alternate body for POST /purchases/from-order (order id in body). */
export const TrackPlayBuyFromOrderBodySchema = z.object({
  orderId: z.string().uuid(),
  seedWardrobe: z.boolean().optional().default(false),
});
export type TrackPlayBuyFromOrderBody = z.infer<typeof TrackPlayBuyFromOrderBodySchema>;

export const TrackPlayBuyResponseSchema = z.object({
  purchase: MerchantPurchaseSchema,
  items: z.array(MerchantPurchaseItemSchema),
  wardrobeItemIds: z.array(z.string().uuid()),
  created: z.boolean(),
  /** Convenience aliases for clients / tests. */
  purchaseId: z.string().uuid(),
  itemCount: z.number().int().nonnegative(),
});
export type TrackPlayBuyResponse = z.infer<typeof TrackPlayBuyResponseSchema>;

/** N33 — Pre-buy closet fit check (overlap / gap / budget). Soft only. */
export const PrebuyCandidateSchema = z.object({
  title: z.string().min(1),
  category: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  priceMinor: z.number().int().nonnegative(),
  qty: z.number().int().positive().optional(),
  listingId: z.string().uuid().nullable().optional(),
});
export type PrebuyCandidateBody = z.infer<typeof PrebuyCandidateSchema>;

export const PrebuyFitBodySchema = z.object({
  /** Score current Play cart against closet. */
  useCart: z.boolean().optional(),
  /** Score specific Play listings. */
  listingIds: z.array(z.string().uuid()).optional(),
  /** Direct candidates (tests / custom carts). */
  candidates: z.array(PrebuyCandidateSchema).optional(),
  /** Alias for candidates (Play checkout / legacy). */
  items: z.array(PrebuyCandidateSchema).optional(),
});
export type PrebuyFitBody = z.infer<typeof PrebuyFitBodySchema>;

export const PrebuyOverlapSchema = z.object({
  candidateTitle: z.string(),
  wardrobeItemId: z.string().uuid(),
  wardrobeLabel: z.string(),
  score: z.number(),
  reason: z.enum(["TITLE", "CATEGORY_BRAND", "CATEGORY"]),
});

export const PrebuyGapSchema = z.object({
  category: z.string(),
  budgetCategory: z.string(),
  ownedCount: z.number().int().nonnegative(),
  message: z.string(),
});

export const PrebuyBudgetNudgeSchema = z.object({
  exceeded: z.boolean(),
  category: z.string(),
  limitMinor: z.number().int(),
  actualMinor: z.number().int(),
  proposedMinor: z.number().int(),
  projectedMinor: z.number().int(),
  message: z.string(),
});
/** Alias used by Play checkout / accountant nudges. */
export const BudgetNudgeSchema = PrebuyBudgetNudgeSchema;
export type BudgetNudge = z.infer<typeof BudgetNudgeSchema>;

/** U047 — Closet soft budget gate (Continue / Cut spend); never hard-blocks pay. */
export const BudgetSoftGateSchema = z
  .object({
    softBlock: z.boolean(),
    title: z.string(),
    body: z.string(),
    continueLabel: z.string(),
    cutSpendLabel: z.string(),
    cutSpendHref: z.string(),
    hardBlock: z.literal(false),
  })
  .nullable();

export const PrebuyFitResponseSchema = z.object({
  score: z.number().int().min(0).max(100),
  overlaps: z.array(PrebuyOverlapSchema),
  gaps: z.array(PrebuyGapSchema),
  budgetNudges: z.array(PrebuyBudgetNudgeSchema),
  softBlock: z.boolean(),
  summary: z.string(),
  /** Convenience primary nudge for Play checkout banner (WV-08 / N33). */
  primaryBudgetNudge: PrebuyBudgetNudgeSchema.nullable(),
  /** U047 — Closet Continue / Cut spend soft gate (optional). */
  budgetSoftGate: BudgetSoftGateSchema.optional(),
});
export type PrebuyFitResponse = z.infer<typeof PrebuyFitResponseSchema>;
