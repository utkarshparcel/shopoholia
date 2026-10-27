import { z } from "zod";

export const GarmentTypeSchema = z.enum(["BLOUSE", "KURTI", "SUIT", "SAREE", "LEHENGA", "SHIRT", "OTHER"]);
export type GarmentType = z.infer<typeof GarmentTypeSchema>;

export const TailorOrderStateSchema = z.enum(["PENDING", "CONFIRMED", "IN_STITCHING", "SHIPPED", "DELIVERED", "CANCELLED"]);
export type TailorOrderState = z.infer<typeof TailorOrderStateSchema>;

export const MeasurementProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  region: z.string(),
  unit: z.enum(["CM", "IN"]),
  points: z.record(z.number()),
  /** U037 — what changed note for this version. */
  changeNote: z.string().nullable().optional(),
  /** U037 — prior profile id this version supersedes. */
  previousId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MeasurementProfile = z.infer<typeof MeasurementProfileSchema>;

export const CreateMeasurementBodySchema = z.object({
  region: z.string().optional().default("IN"),
  unit: z.enum(["CM", "IN"]).optional().default("CM"),
  points: z.record(z.number()),
  changeNote: z.string().max(240).optional().nullable(),
});
export type CreateMeasurementBody = z.infer<typeof CreateMeasurementBodySchema>;

export const UpdateMeasurementBodySchema = z.object({
  points: z.record(z.number()),
  changeNote: z.string().max(240).optional().nullable(),
  region: z.string().optional(),
  unit: z.enum(["CM", "IN"]).optional(),
});
export type UpdateMeasurementBody = z.infer<typeof UpdateMeasurementBodySchema>;

export const MeasurementListResponseSchema = z.object({
  measurements: z.array(MeasurementProfileSchema),
});
export type MeasurementListResponse = z.infer<typeof MeasurementListResponseSchema>;

export const MeasurementHistoryResponseSchema = z.object({
  latest: MeasurementProfileSchema.nullable(),
  history: z.array(MeasurementProfileSchema),
});
export type MeasurementHistoryResponse = z.infer<typeof MeasurementHistoryResponseSchema>;

export const CustomizationTemplateSchema = z.object({
  id: z.string().uuid(),
  region: z.string(),
  garmentType: GarmentTypeSchema,
  name: z.string(),
  optionsSchema: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomizationTemplate = z.infer<typeof CustomizationTemplateSchema>;

export const TemplatesResponseSchema = z.object({
  templates: z.array(CustomizationTemplateSchema),
});
export type TemplatesResponse = z.infer<typeof TemplatesResponseSchema>;

export const CreateTailoringOrderBodySchema = z.object({
  templateId: z.string().uuid(),
  measurementProfileId: z.string().uuid().optional().nullable(),
  selections: z.record(z.string()).default({}),
  fabricRef: z.string().optional().nullable(),
  fabricPhotoKeys: z.array(z.string()).optional().default([]),
  tailorSellerId: z.string().uuid().optional().nullable(),
  expectedPickupOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});
export type CreateTailoringOrderBody = z.infer<typeof CreateTailoringOrderBodySchema>;

export const TailoringOrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  measurementProfileId: z.string().uuid().nullable(),
  selections: z.record(z.string()),
  fabricRef: z.string().nullable(),
  fabricPhotoKeys: z.array(z.string()).default([]),
  tailorSellerId: z.string().uuid().nullable(),
  measurementSnapshot: z.record(z.unknown()).nullable(),
  state: TailorOrderStateSchema,
  /** U038 — expected pickup YYYY-MM-DD for T-1d nudge. */
  expectedPickupOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** U038 — status timeline for chase UI. */
  timeline: z
    .array(
      z.object({
        state: TailorOrderStateSchema,
        label: z.string(),
        reached: z.boolean(),
        current: z.boolean(),
      }),
    )
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TailoringOrder = z.infer<typeof TailoringOrderSchema>;

export const TailoringOrderResponseSchema = TailoringOrderSchema;
export type TailoringOrderResponse = z.infer<typeof TailoringOrderResponseSchema>;

export const TailorSellerSchema = z.object({
  id: z.string().uuid(),
  shopName: z.string(),
  sellerType: z.literal("TAILOR"),
  ratingAvg: z.number().nullable(),
  reviewCount: z.number().int().nonnegative(),
});
export type TailorSeller = z.infer<typeof TailorSellerSchema>;

export const TailorsResponseSchema = z.object({
  tailors: z.array(TailorSellerSchema),
});
export type TailorsResponse = z.infer<typeof TailorsResponseSchema>;

export const CreateTailorReviewBodySchema = z.object({
  orderId: z.string().uuid().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
});
export type CreateTailorReviewBody = z.infer<typeof CreateTailorReviewBodySchema>;

export const TailorReviewSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  userId: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type TailorReview = z.infer<typeof TailorReviewSchema>;

export const TailorReviewsResponseSchema = z.object({
  reviews: z.array(TailorReviewSchema),
  ratingAvg: z.number().nullable(),
});
export type TailorReviewsResponse = z.infer<typeof TailorReviewsResponseSchema>;

export const FitPreviewBodySchema = z.object({
  templateId: z.string().uuid(),
  selections: z.record(z.string()).default({}),
});
export type FitPreviewBody = z.infer<typeof FitPreviewBodySchema>;

export const FitPreviewResponseSchema = z.object({
  status: z.enum(["READY", "PROCESSING", "NO_AVATAR"]),
  previewUrl: z.string().nullable(),
  imageKey: z.string().nullable(),
  selections: z.record(z.string()),
  summary: z.string(),
});
export type FitPreviewResponse = z.infer<typeof FitPreviewResponseSchema>;

export const FabricUploadResponseSchema = z.object({
  key: z.string(),
  url: z.string().nullable(),
});
export type FabricUploadResponse = z.infer<typeof FabricUploadResponseSchema>;
