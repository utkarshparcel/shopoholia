/**
 * MON-UPI-REGIONAL — payments adapter types (Razorpay/UPI scaffold, no secrets).
 */

import { z } from "zod";

export const PaymentProviderSchema = z.enum(["razorpay_upi", "stub", "revenuecat"]);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const CreatePaymentIntentBodySchema = z.object({
  productId: z.string().min(1),
  region: z.enum(["IN", "US", "GLOBAL"]).default("IN"),
  method: z.enum(["upi", "card", "iap"]).optional(),
});

export const PaymentIntentSchema = z.object({
  id: z.string(),
  provider: PaymentProviderSchema,
  productId: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string(),
  /** UPI intent / deep-link when provider is razorpay_upi (staging stub URL). */
  upiIntentUrl: z.string().nullable(),
  status: z.enum(["created", "pending", "paid", "failed"]),
  /** Never a real key — placeholder for client SDK init when wired. */
  publicKeyHint: z.string().nullable(),
  /** Razorpay order id for the client's checkout (razorpay_upi only). */
  providerOrderId: z.string().nullable().optional(),
});

export const ConfirmPaymentBodySchema = z.object({
  intentId: z.string().min(1),
  /** Payment id from Razorpay checkout (`razorpay_payment_id`). */
  providerPaymentId: z.string().min(1).optional(),
  /** `razorpay_order_id` from checkout; must match the intent's order. */
  providerOrderId: z.string().min(1).optional(),
  /** `razorpay_signature` from checkout. Without it the intent stays pending until the webhook. */
  providerSignature: z.string().min(1).optional(),
});

export const ConfirmPaymentResponseSchema = z.object({
  intent: PaymentIntentSchema,
  entitlementsGranted: z.array(z.string()),
});

export type CreatePaymentIntentBody = z.infer<typeof CreatePaymentIntentBodySchema>;
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;
export type ConfirmPaymentBody = z.infer<typeof ConfirmPaymentBodySchema>;
export type ConfirmPaymentResponse = z.infer<typeof ConfirmPaymentResponseSchema>;
