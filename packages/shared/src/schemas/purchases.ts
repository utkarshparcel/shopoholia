import { z } from "zod";
import { PackageDeliveryStatusSchema } from "./packages.js";

export const PurchaseSourceSchema = z.enum([
  "EMAIL",
  "SMS",
  "MANUAL",
  "RECEIPT",
]);

export type PurchaseSource = z.infer<typeof PurchaseSourceSchema>;

export const PurchaseStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "DUPLICATE",
]);

export type PurchaseStatus = z.infer<typeof PurchaseStatusSchema>;

export const MerchantPurchaseItemSchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  title: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable().optional(),
  priceMinor: z.number().int().nonnegative(),
  imageKey: z.string().nullable(),
  qty: z.number().int().positive(),
  duplicateWardrobeItemId: z.string().uuid().nullable().optional(),
});

export const MerchantPurchaseSchema = z.object({
  id: z.string().uuid(),
  source: PurchaseSourceSchema,
  merchant: z.string(),
  orderRef: z.string().nullable(),
  purchasedAt: z.string().datetime(),
  currency: z.string(),
  totalMinor: z.number().int().nonnegative(),
  status: PurchaseStatusSchema,
  rawDocId: z.string().uuid().nullable(),
  deliveryStatus: PackageDeliveryStatusSchema.optional(),
  etaAt: z.string().datetime().nullable().optional(),
  trackingCode: z.string().nullable().optional(),
  deliveredAt: z.string().datetime().nullable().optional(),
  returnWindowDeadline: z.string().datetime().nullable().optional(),
  exchangeWindowDeadline: z.string().datetime().nullable().optional(),
});

export const IngestPurchaseBodySchema = z.object({
  source: PurchaseSourceSchema,
  merchant: z.string().min(1),
  orderRef: z.string().nullable().optional(),
  purchasedAt: z.string().datetime().optional(),
  currency: z.string().min(1),
  totalMinor: z.number().int().nonnegative(),
  deliveryStatus: PackageDeliveryStatusSchema.optional(),
  etaAt: z.string().datetime().nullable().optional(),
  trackingCode: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        category: z.string().nullable().optional(),
        brand: z.string().nullable().optional(),
        priceMinor: z.number().int().nonnegative(),
        imageKey: z.string().nullable().optional(),
        qty: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});

export const PurchasesListResponseSchema = z.object({
  purchases: z.array(MerchantPurchaseSchema),
});

/** N48 — merge two double-parsed purchases into one. */
export const MergePurchasesBodySchema = z
  .object({
    targetPurchaseId: z.string().uuid(),
    sourcePurchaseId: z.string().uuid(),
  })
  .refine((b) => b.targetPurchaseId !== b.sourcePurchaseId, {
    message: "targetPurchaseId and sourcePurchaseId must differ",
  });

export const PurchaseWithItemsSchema = z.object({
  purchase: MerchantPurchaseSchema,
  items: z.array(MerchantPurchaseItemSchema),
});

export const MergePurchasesResponseSchema = z.object({
  purchase: MerchantPurchaseSchema,
  items: z.array(MerchantPurchaseItemSchema),
  mergedFromId: z.string().uuid(),
});

/** N48 — split selected line items onto a new purchase. */
export const SplitPurchaseBodySchema = z.object({
  purchaseId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1),
  merchant: z.string().min(1).optional(),
});

export const SplitPurchaseResponseSchema = z.object({
  original: PurchaseWithItemsSchema,
  split: PurchaseWithItemsSchema,
});

export const PurchasesDetailListResponseSchema = z.object({
  purchases: z.array(PurchaseWithItemsSchema),
});

export type MerchantPurchase = z.infer<typeof MerchantPurchaseSchema>;
export type MerchantPurchaseItem = z.infer<typeof MerchantPurchaseItemSchema>;
export type IngestPurchaseBody = z.infer<typeof IngestPurchaseBodySchema>;
export type PurchasesListResponse = z.infer<typeof PurchasesListResponseSchema>;
export type MergePurchasesBody = z.infer<typeof MergePurchasesBodySchema>;
export type MergePurchasesResponse = z.infer<typeof MergePurchasesResponseSchema>;
export type SplitPurchaseBody = z.infer<typeof SplitPurchaseBodySchema>;
export type SplitPurchaseResponse = z.infer<typeof SplitPurchaseResponseSchema>;
export type PurchasesDetailListResponse = z.infer<
  typeof PurchasesDetailListResponseSchema
>;
