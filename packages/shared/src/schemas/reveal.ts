import { z } from "zod";

export const RenderScenarioSchema = z.enum([
  "STUDIO",
  "GOLDEN_HOUR",
  "STREET",
  "EDITORIAL_DARK",
  "NIGHT",
  "CANDID",
]);

export type RenderScenario = z.infer<typeof RenderScenarioSchema>;

export const RenderStatusSchema = z.enum(["QUEUED", "RUNNING", "DONE", "FAILED"]);

export type RenderStatus = z.infer<typeof RenderStatusSchema>;

export const RenderCardSchema = z.object({
  id: z.string().uuid(),
  orderItemId: z.string().uuid(),
  scenario: RenderScenarioSchema,
  imageUrl: z.string().url().nullable(),
  isFree: z.boolean(),
  unlocked: z.boolean(),
  status: RenderStatusSchema,
  unlockCostCoins: z.number().int().nonnegative().optional(),
});

export type RenderCard = z.infer<typeof RenderCardSchema>;

export const RevealResponseSchema = z.object({
  orderId: z.string().uuid(),
  renders: z.array(RenderCardSchema),
});

export type RevealResponse = z.infer<typeof RevealResponseSchema>;

export const UnlockBodySchema = z.object({
  renderIds: z.array(z.string().uuid()).min(1),
  idempotencyKey: z.string().uuid().optional(),
});

export type UnlockBody = z.infer<typeof UnlockBodySchema>;

export const UnlockResponseSchema = z.object({
  renders: z.array(RenderCardSchema),
  coinsSpent: z.number().int().nonnegative(),
});

export type UnlockResponse = z.infer<typeof UnlockResponseSchema>;
