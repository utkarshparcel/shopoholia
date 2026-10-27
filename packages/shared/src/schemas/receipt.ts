import { z } from "zod";

export const ReceiptItemSchema = z.object({
  title: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  category: z.string().optional(),
});

export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

/** Parsed OCR result returned for review before confirmation. */
export const ReceiptParsedSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  imageUrl: z.string(),
  merchant: z.string(),
  purchasedAt: z.string().datetime(),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().default("INR"),
  items: z.array(ReceiptItemSchema),
  ocrJson: z.record(z.unknown()),
  purchaseId: z.string().uuid().nullable(),
  /** OCR confidence in [0, 1] — always present. */
  confidence: z.number().min(0).max(1),
  warrantyHint: z
    .object({ itemIndex: z.number().int().nonnegative(), months: z.number().int().positive() })
    .nullable()
    .optional(),
  /** Support email / URL / phone extracted from OCR when present. */
  claimContactHint: z.string().nullable().optional(),
  /** GSTIN when detected or corrected. */
  gstin: z.string().nullable().optional(),
});

export type ReceiptParsed = z.infer<typeof ReceiptParsedSchema>;

/** Editable review payload sent to POST /receipts/:id/confirm. */
export const ConfirmReceiptBodySchema = z.object({
  merchant: z.string().min(1),
  purchasedAt: z.string().datetime(),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().default("INR"),
  items: z.array(ReceiptItemSchema).min(1),
  /** Per-item warranty coverage. Index aligns with the items array. */
  warranties: z
    .array(
      z.object({
        itemIndex: z.number().int().nonnegative(),
        coverageUntil: z.string().datetime(),
        claimContact: z.string().optional(),
        category: z.enum(["electronics", "appliances", "apparel"]).optional(),
      }),
    )
    .optional(),
  /**
   * Client acknowledges low OCR confidence and still wants to confirm.
   * Mobile gates confirm below the product threshold unless this is true.
   */
  overrideLowConfidence: z.boolean().optional(),
});

export type ConfirmReceiptBody = z.infer<typeof ConfirmReceiptBodySchema>;

/**
 * Manual correction of OCR fields before (or without) confirming into a purchase.
 * At least one field must be present.
 */
export const PatchReceiptBodySchema = z
  .object({
    merchant: z.string().min(1).optional(),
    purchasedAt: z.string().datetime().optional(),
    totalMinor: z.number().int().nonnegative().optional(),
    items: z.array(ReceiptItemSchema).min(1).optional(),
    gstin: z.string().min(1).nullable().optional(),
  })
  .refine(
    (v) =>
      v.merchant !== undefined ||
      v.purchasedAt !== undefined ||
      v.totalMinor !== undefined ||
      v.items !== undefined ||
      v.gstin !== undefined,
    { message: "At least one of merchant, purchasedAt, totalMinor, items, gstin is required" },
  );

export type PatchReceiptBody = z.infer<typeof PatchReceiptBodySchema>;

export const ReceiptResponseSchema = z.object({
  id: z.string().uuid(),
  merchant: z.string(),
  purchasedAt: z.string().datetime(),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string(),
  imageUrl: z.string(),
  purchaseId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  /** OCR confidence in [0, 1] — always present. */
  confidence: z.number().min(0).max(1),
  /** GSTIN when OCR / correction captured one. */
  gstin: z.string().nullable().optional(),
});

export type ReceiptResponse = z.infer<typeof ReceiptResponseSchema>;

export const ReceiptListResponseSchema = z.object({
  receipts: z.array(ReceiptResponseSchema),
});

export type ReceiptListResponse = z.infer<typeof ReceiptListResponseSchema>;

export const ReceiptSearchQuerySchema = z.object({
  merchant: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  gstin: z.string().min(1).optional(),
});

export type ReceiptSearchQuery = z.infer<typeof ReceiptSearchQuerySchema>;

export const ReceiptExportFormatSchema = z.enum(["image", "pdf"]);
export type ReceiptExportFormat = z.infer<typeof ReceiptExportFormatSchema>;

export const ReceiptExportResponseSchema = z.object({
  id: z.string().uuid(),
  format: ReceiptExportFormatSchema,
  filename: z.string().min(1),
  contentType: z.string().min(1),
  /** Signed URL for image export, or data URL / download URL for PDF. */
  downloadUrl: z.string().min(1),
  gstin: z.string().nullable(),
  merchant: z.string(),
});

export type ReceiptExportResponse = z.infer<typeof ReceiptExportResponseSchema>;

/** Default client-side gate: confirm blocked below this unless user overrides. */
export const OCR_CONFIRM_CONFIDENCE_THRESHOLD = 0.7;
