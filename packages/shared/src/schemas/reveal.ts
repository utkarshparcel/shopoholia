import { z } from "zod";
import { REVEAL_COMBINE_MAX_ITEMS } from "../economy.js";

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
  id: z.uuid(),
  orderItemId: z.uuid(),
  scenario: RenderScenarioSchema,
  imageUrl: z.url().nullable(),
  isFree: z.boolean(),
  unlocked: z.boolean(),
  status: RenderStatusSchema,
  unlockCostCoins: z.number().int().nonnegative().optional(),
});

export type RenderCard = z.infer<typeof RenderCardSchema>;

export const RevealResponseSchema = z.object({
  orderId: z.uuid(),
  renders: z.array(RenderCardSchema),
  /**
   * The renders are waiting for the render agent (it is down, its night window is closed, or the
   * queue is backed up), so the app shows when they should be ready instead of a spinner.
   */
  rendersWaiting: z.boolean().optional(),
  /** When the waiting renders should be ready; null when there is no estimate ("shortly"). */
  expectedReadyAt: z.iso.datetime().nullable().optional(),
});

export type RevealResponse = z.infer<typeof RevealResponseSchema>;

export const UnlockBodySchema = z.object({
  renderIds: z.array(z.uuid()).min(1),
  idempotencyKey: z.uuid().optional(),
});

export type UnlockBody = z.infer<typeof UnlockBodySchema>;

export const UnlockResponseSchema = z.object({
  renders: z.array(RenderCardSchema),
  coinsSpent: z.number().int().nonnegative(),
});

export type UnlockResponse = z.infer<typeof UnlockResponseSchema>;

/**
 * One id renders that item; several (repeats count once, at most REVEAL_COMBINE_MAX_ITEMS) make
 * one combined render of them together. Every id must be a line of the order.
 *
 * `idempotencyKey` (one per user action, kept across retries) is scoped to the order: a repeat of
 * the key returns the first call's render and charges nothing, whatever the repeat's body asks for.
 */
export const GenerateRenderBodySchema = z.object({
  orderItemIds: z.array(z.uuid()).min(1).max(REVEAL_COMBINE_MAX_ITEMS),
  scenario: RenderScenarioSchema,
  idempotencyKey: z.uuid().optional(),
});

export const GenerateRenderResponseSchema = z.object({
  renders: z.array(RenderCardSchema),
  coinsSpent: z.number().int().nonnegative(),
  isCombine: z.boolean().optional(),
});

export type GenerateRenderBody = z.infer<typeof GenerateRenderBodySchema>;
export type GenerateRenderResponse = z.infer<typeof GenerateRenderResponseSchema>;

/** Free renders of the order that FAILED, to render again. Paid ones are refunded instead. */
export const RetryRendersBodySchema = z.object({
  renderIds: z.array(z.uuid()).min(1).max(50),
});

export const RetryRendersResponseSchema = z.object({
  renders: z.array(RenderCardSchema),
});

export type RetryRendersBody = z.infer<typeof RetryRendersBodySchema>;
export type RetryRendersResponse = z.infer<typeof RetryRendersResponseSchema>;
