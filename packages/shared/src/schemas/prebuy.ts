import { z } from "zod";
import { BudgetCategorySchema, BudgetPeriodSchema } from "./accountant.js";

/**
 * Legacy prebuy helpers. Canonical Play↔Closet bridge schemas live in
 * `schemas/bridge.ts` — re-export aliases here so older imports keep working.
 */
export {
  BudgetNudgeSchema,
  PrebuyOverlapSchema,
  PrebuyGapSchema,
  PrebuyFitResponseSchema,
  PrebuyFitBodySchema,
  TrackPlayBuyBodySchema,
  TrackPlayBuyResponseSchema,
  type BudgetNudge,
  type PrebuyFitResponse,
  type PrebuyFitBody,
  type TrackPlayBuyBody,
  type TrackPlayBuyResponse,
} from "./bridge.js";

export const BudgetContextSchema = z.object({
  category: BudgetCategorySchema,
  period: BudgetPeriodSchema,
  limitMinor: z.number().int().nonnegative(),
  actualMinor: z.number().int().nonnegative(),
});
