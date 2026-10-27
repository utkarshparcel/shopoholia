import { z } from "zod";

export const DuplicateMatchSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  wardrobeLabel: z.string(),
  wardrobeBrand: z.string().nullable(),
  score: z.number().min(0).max(1),
  reason: z.string(),
});
export type DuplicateMatch = z.infer<typeof DuplicateMatchSchema>;

export const DuplicateWarningSchema = z.object({
  candidateTitle: z.string(),
  candidateBrand: z.string().nullable().optional(),
  listingId: z.string().uuid().optional(),
  purchaseItemId: z.string().uuid().optional(),
  matches: z.array(DuplicateMatchSchema).min(1),
});
export type DuplicateWarning = z.infer<typeof DuplicateWarningSchema>;

export const DuplicateCheckResponseSchema = z.object({
  warnings: z.array(DuplicateWarningSchema),
});
export type DuplicateCheckResponse = z.infer<typeof DuplicateCheckResponseSchema>;
