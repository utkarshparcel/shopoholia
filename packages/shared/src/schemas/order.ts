import { z } from "zod";

export const OrderState = z.enum([
  "PENDING",
  "PROCESSING",
  "PACKED",
  "OUT_FOR_DELIVERY",
  "ARRIVING_SOON",
  "DELIVERED",
  "REVEAL_READY",
  "FAILED",
  "CANCELLED",
]);

export type OrderState = z.infer<typeof OrderState>;

export const DeliveryTier = z.enum(["EXPRESS", "STANDARD", "SLOW_BURN"]);

export type DeliveryTier = z.infer<typeof DeliveryTier>;

export const StateEtaSchema = z.record(OrderState, z.string().datetime().optional());

export type StateEta = z.infer<typeof StateEtaSchema>;

export const CreateOrderBodySchema = z.object({
  tier: DeliveryTier,
  idempotencyKey: z.string().uuid().optional(),
  /** Confirm override of N34 24h apparel cooling-off soft lock. */
  coolingOffOverride: z.boolean().optional(),
});

export const OrderSummarySchema = z.object({
  id: z.string().uuid(),
  tier: DeliveryTier,
  state: OrderState,
  coinTotal: z.number().int().nonnegative(),
  placedAt: z.string().datetime(),
  stateEta: StateEtaSchema.optional(),
  /** True when paying rushCostCoins would move the order's remaining steps earlier. */
  rushAvailable: z.boolean(),
  rushCostCoins: z.number().int().nonnegative(),
  /** Soft spend-awareness nudge (WV-08) — never blocks checkout. */
  budgetNudge: z
    .object({
      exceeded: z.boolean(),
      category: z.string(),
      limitMinor: z.number().int().nonnegative(),
      actualMinor: z.number().int().nonnegative(),
      proposedMinor: z.number().int().nonnegative(),
      projectedMinor: z.number().int().nonnegative(),
      message: z.string(),
    })
    .nullable()
    .optional(),
  /** True when this Play order was already tracked into Closet. */
  trackedInCloset: z.boolean().optional(),
  /** Soft "you may already own this" warnings — never blocks checkout. */
  duplicateWarnings: z
    .array(
      z.object({
        candidateTitle: z.string(),
        candidateBrand: z.string().nullable().optional(),
        listingId: z.string().uuid().optional(),
        matches: z.array(
          z.object({
            wardrobeItemId: z.string().uuid(),
            wardrobeLabel: z.string(),
            wardrobeBrand: z.string().nullable(),
            score: z.number(),
            reason: z.string(),
          }),
        ),
      }),
    )
    .optional(),
});

export const OrderListResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
});

export const RushOrderResponseSchema = z.object({
  order: OrderSummarySchema,
  balanceAfter: z.number().int().nonnegative(),
});

export const OrderParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateOrderBody = z.infer<typeof CreateOrderBodySchema>;
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;
export type RushOrderResponse = z.infer<typeof RushOrderResponseSchema>;

/** Timer-driven states after checkout (PROCESSING is initial). */
export const ORDER_DELIVERY_LADDER = [
  "PACKED",
  "OUT_FOR_DELIVERY",
  "ARRIVING_SOON",
  "DELIVERED",
] as const satisfies readonly OrderState[];

/** Full arc including render-driven REVEAL_READY (not timer-scheduled). */
export const ORDER_STATE_LADDER = [
  ...ORDER_DELIVERY_LADDER,
  "REVEAL_READY",
] as const satisfies readonly OrderState[];
