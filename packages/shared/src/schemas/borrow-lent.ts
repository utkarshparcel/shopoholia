import { z } from "zod";
import { WardrobeItemSchema } from "./wardrobe.js";

export const LendBodySchema = z.object({
  lentTo: z.string().min(1).max(80),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type LendBody = z.infer<typeof LendBodySchema>;

export const LendActionResponseSchema = z.object({
  item: WardrobeItemSchema,
  overdue: z.boolean(),
  pushScheduled: z.boolean().optional(),
});
export type LendActionResponse = z.infer<typeof LendActionResponseSchema>;

export const LentListQuerySchema = z.object({
  /** all | due (on/before asOf) | overdue (before asOf) */
  due: z.enum(["all", "due", "overdue"]).optional().default("all"),
  /** YYYY-MM-DD; defaults to today UTC when omitted for due/overdue. */
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type LentListQuery = z.infer<typeof LentListQuerySchema>;

export const LentListResponseSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filter: z.enum(["all", "due", "overdue"]),
  items: z.array(WardrobeItemSchema),
});
export type LentListResponse = z.infer<typeof LentListResponseSchema>;

/** U039 — overdue enforce actions. */
export const LentOverdueActionBodySchema = z.object({
  action: z.enum(["nudge", "returned", "lost"]),
});
export type LentOverdueActionBody = z.infer<typeof LentOverdueActionBodySchema>;

export const LentOverdueActionResponseSchema = z.object({
  action: z.enum(["nudge", "returned", "lost"]),
  item: WardrobeItemSchema.optional(),
  message: z.string().optional(),
  wasteNote: z.string().nullable().optional(),
  overdue: z.boolean().optional(),
});
export type LentOverdueActionResponse = z.infer<typeof LentOverdueActionResponseSchema>;
