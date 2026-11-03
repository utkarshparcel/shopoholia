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

export const GoogleAuthRequestSchema = z.object({
  idToken: z.string().min(20),
});

export type GoogleAuthRequest = z.infer<typeof GoogleAuthRequestSchema>;

/**
 * Sign in with Apple (iOS). `identityToken` is the credential's JWT; `nonce` is the raw nonce the
 * app generated, whose SHA-256 (hex) it gave Apple, so the server can tie the token to this
 * sign-in. Apple sends the name only on the first sign-in, so the app passes it along then.
 */
export const AppleAuthRequestSchema = z.object({
  identityToken: z.string().min(20),
  nonce: z.string().min(16).max(128),
  fullName: z.string().trim().max(120).nullish(),
  /**
   * The credential's one-time authorization code. The API exchanges it for a refresh token so
   * account deletion can revoke the Apple grant. Optional: older app builds don't send it.
   */
  authorizationCode: z.string().min(1).max(2048).nullish(),
});

export type AppleAuthRequest = z.infer<typeof AppleAuthRequestSchema>;

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
