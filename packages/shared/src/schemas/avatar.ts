import { z } from "zod";

export const AvatarStatusSchema = z.enum(["NONE", "PROCESSING", "READY", "FAILED"]);

export type AvatarStatus = z.infer<typeof AvatarStatusSchema>;

export const AvatarResponseSchema = z.object({
  status: AvatarStatusSchema,
  referencePreviewUrl: z.string().url().nullable(),
});

export type AvatarResponse = z.infer<typeof AvatarResponseSchema>;

export const AvatarUploadResponseSchema = z.object({
  status: AvatarStatusSchema,
  jobId: z.string().uuid(),
});

export type AvatarUploadResponse = z.infer<typeof AvatarUploadResponseSchema>;
