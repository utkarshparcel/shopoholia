import { z } from "zod";

export const CartItemSchema = z.object({
  variantId: z.uuid(),
  listingId: z.uuid(),
  title: z.string(),
  size: z.string(),
  color: z.string(),
  coinPriceSnapshot: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  imageUrl: z.url(),
});

export const CartCoolingOffSchema = z
  .object({
    active: z.boolean(),
    heldAt: z.iso.datetime(),
    releaseAt: z.iso.datetime(),
    category: z.string(),
    projectedMinor: z.number().int().nonnegative(),
    limitMinor: z.number().int().nonnegative(),
    message: z.string(),
  })
  .nullable();

export const CartResponseSchema = z.object({
  items: z.array(CartItemSchema),
  coinTotal: z.number().int().nonnegative(),
  /** N34 soft lock when apparel haul exceeds budget. */
  coolingOff: CartCoolingOffSchema.optional(),
});

export const AddToCartBodySchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const RemoveFromCartBodySchema = z.object({
  variantId: z.uuid(),
});

export type CartItem = z.infer<typeof CartItemSchema>;
export type CartResponse = z.infer<typeof CartResponseSchema>;
export type AddToCartBody = z.infer<typeof AddToCartBodySchema>;
export type RemoveFromCartBody = z.infer<typeof RemoveFromCartBodySchema>;
