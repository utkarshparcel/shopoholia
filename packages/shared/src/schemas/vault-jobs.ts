import { z } from "zod";

/**
 * C6 background jobs owned by the vault (privacy): queue names, job names and payloads.
 * Handlers live in apps/api/src/jobs/<name>.ts and are safe to run twice.
 */
export const PRIVACY_ERASE_QUEUE = "privacy-erase";
export const PRIVACY_EXPORT_QUEUE = "privacy-export";
export const GMAIL_TOKEN_REVOKE_QUEUE = "gmail-token-revoke";
export const INGESTION_RETENTION_QUEUE = "ingestion-retention";

/** DELETE /vault: erase every row and stored object of the request's user. */
export const PrivacyEraseJobSchema = z.object({ requestId: z.string().uuid() });

/** POST /vault/export: build the export file and store it for download. */
export const PrivacyExportJobSchema = z.object({ requestId: z.string().uuid() });

/**
 * Consent withdrawal / erasure: revoke a Gmail grant at Google. Carries the encrypted token
 * blob (AES-256-GCM); the plaintext only exists inside the handler.
 */
export const GmailTokenRevokeJobSchema = z.object({
  sourceId: z.string().uuid(),
  encryptedToken: z.string().min(1).max(8192),
});

/** Retention sweep (scheduled by jobs): purge raw ingestion objects past their kind's TTL. */
export const IngestionRetentionJobSchema = z.object({
  batchSize: z.number().int().min(1).max(1000).optional(),
});

export type PrivacyEraseJob = z.infer<typeof PrivacyEraseJobSchema>;
export type PrivacyExportJob = z.infer<typeof PrivacyExportJobSchema>;
export type GmailTokenRevokeJob = z.infer<typeof GmailTokenRevokeJobSchema>;
export type IngestionRetentionJob = z.infer<typeof IngestionRetentionJobSchema>;
