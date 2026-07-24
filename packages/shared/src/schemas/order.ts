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
});

export const OrderSummarySchema = z.object({
  id: z.string().uuid(),
  tier: DeliveryTier,
  state: OrderState,
  coinTotal: z.number().int().nonnegative(),
  placedAt: z.string().datetime(),
  stateEta: StateEtaSchema.optional(),
});

export const OrderListResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
});

export const OrderParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateOrderBody = z.infer<typeof CreateOrderBodySchema>;
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

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
