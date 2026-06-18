import { z } from "zod";

export const OtpRequestSchema = z.object({
  phone: z.string().min(10).max(15),
});

export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpResponseSchema = z.object({
  message: z.string(),
});

export type OtpResponse = z.infer<typeof OtpResponseSchema>;

export const VerifyRequestSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
});

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  isNewUser: z.boolean().optional(),
  coinBalance: z.number().int().nonnegative().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
