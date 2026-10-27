import { createHash } from "node:crypto";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

// Mirrors services/worker-ingest/src/queues.ts. Kept local to avoid a hard
// build-time dependency on the worker package from the API.
export const INGEST_QUEUE = "ingest-email";
export const INGEST_JOB_NAME = "email-received";
export const INGEST_RESYNC_JOB_NAME = "email-resync";
export const INGEST_OAUTH_JOB_NAME = "email-oauth";
export const INGEST_DEAD_LETTER_QUEUE = "ingest-dead-letter";

function stableIngestJobId(payload: IngestJobPayload): string | undefined {
  if (payload.documentId) return jobIdFrom(`ingest:${payload.documentId}`);
  if (payload.message && typeof payload.message === "object") {
    const m = payload.message as { messageId?: string };
    if (m.messageId) return jobIdFrom(`ingest:msg:${m.messageId}`);
  }
  return undefined;
}

function stableOauthJobId(payload: OauthCompletePayload): string {
  const hash = createHash("sha256").update(payload.code).digest("hex").slice(0, 16);
  return jobIdFrom(`oauth:${payload.sourceId}:${hash}`);
}

export type IngestJobPayload = {
  kind: "EMAIL" | "SMS";
  documentId?: string;
  userId?: string;
  message?: unknown;
  payload?: unknown;
};

export type OauthCompletePayload = {
  sourceId: string;
  code: string;
  userId: string;
};

/**
 * Publish to the ingest worker's BullMQ queue (3 attempts, exponential backoff).
 *
 * Throws QueueUnavailableError (503) when Redis can't take the job, so the
 * caller fails visibly and the sender (a webhook, the app) retries; the job id
 * is stable per document or message, so a retry is not a second job. Without
 * REDIS_URL outside production it resolves to "skipped".
 */
export async function publishIngestJob(
  payload: IngestJobPayload,
): Promise<"published" | "skipped"> {
  const result = await enqueueJob(INGEST_QUEUE, INGEST_JOB_NAME, payload, {
    jobId: stableIngestJobId(payload),
  });
  return result.status === "queued" ? "published" : "skipped";
}

/**
 * Enqueue an OAuth-complete job for the ingest worker (B2). The worker performs
 * the token exchange and stores the tokens encrypted at rest. Throws
 * QueueUnavailableError when Redis can't take it; "skipped" only without
 * REDIS_URL outside production, and the caller surfaces that.
 */
export async function publishOauthCompleteJob(
  payload: OauthCompletePayload,
): Promise<"published" | "skipped"> {
  const result = await enqueueJob(INGEST_QUEUE, INGEST_OAUTH_JOB_NAME, payload, {
    jobId: stableOauthJobId(payload),
  });
  return result.status === "queued" ? "published" : "skipped";
}

/** Test helper — expose stable jobId computation. */
export function _stableIngestJobId(payload: IngestJobPayload): string | undefined {
  return stableIngestJobId(payload);
}
export function _stableOauthJobId(payload: OauthCompletePayload): string {
  return stableOauthJobId(payload);
}
