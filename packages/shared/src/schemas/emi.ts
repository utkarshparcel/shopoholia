import { z } from "zod";

export const EmiPlanStatusSchema = z.enum(["ACTIVE", "PAID", "DEFAULTED"]);
export type EmiPlanStatus = z.infer<typeof EmiPlanStatusSchema>;

export const EmiPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: z.string().min(1),
  merchant: z.string().nullable(),
  principalMinor: z.number().int().nonnegative(),
  remainingMinor: z.number().int().nonnegative(),
  installmentMinor: z.number().int().positive(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string(),
  status: EmiPlanStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateEmiPlanBodySchema = z.object({
  provider: z.string().min(1).max(80),
  merchant: z.string().max(120).nullable().optional(),
  principalMinor: z.number().int().positive(),
  remainingMinor: z.number().int().nonnegative().optional(),
  installmentMinor: z.number().int().positive(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().optional(),
});

export const PayEmiBodySchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  /** One key per tap: a retry with the same key records the installment once. */
  idempotencyKey: z.string().uuid().optional(),
});

export const EmiPlanListResponseSchema = z.object({
  plans: z.array(EmiPlanSchema),
});

export const EmiScheduleItemSchema = z.object({
  index: z.number().int().positive(),
  dueOn: z.string(),
  amountMinor: z.number().int().nonnegative(),
});

export const EmiScheduleResponseSchema = z.object({
  planId: z.string().uuid(),
  remainingMinor: z.number().int().nonnegative(),
  schedule: z.array(EmiScheduleItemSchema),
});

export type EmiPlan = z.infer<typeof EmiPlanSchema>;
export type CreateEmiPlanBody = z.infer<typeof CreateEmiPlanBodySchema>;
export type PayEmiBody = z.infer<typeof PayEmiBodySchema>;
export type EmiPlanListResponse = z.infer<typeof EmiPlanListResponseSchema>;
export type EmiScheduleResponse = z.infer<typeof EmiScheduleResponseSchema>;
