import { createHash, randomUUID } from "node:crypto";

// Mirrors services/worker-ingest/src/queues.ts. Kept local to avoid a hard
// build-time dependency on the worker package from the API.
export const INGEST_QUEUE = "ingest-email";
export const INGEST_JOB_NAME = "email-received";
export const INGEST_RESYNC_JOB_NAME = "email-resync";
export const INGEST_OAUTH_JOB_NAME = "email-oauth";
export const INGEST_DEAD_LETTER_QUEUE = "ingest-dead-letter";

function stableIngestJobId(payload: IngestJobPayload): string | undefined {
  if (payload.documentId) return `ingest:${payload.documentId}`;
  if (payload.message && typeof payload.message === "object") {
    const m = payload.message as { messageId?: string };
    if (m.messageId) return `ingest:msg:${m.messageId}`;
  }
  return undefined;
}

function stableOauthJobId(payload: OauthCompletePayload): string {
  const hash = createHash("sha256").update(payload.code).digest("hex").slice(0, 16);
  return `oauth:${payload.sourceId}:${hash}`;
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
 * Best-effort publish to the ingest worker's BullMQ queue.
 *
 * Requires a Redis connection (INGEST_REDIS_URL / REDIS_URL). When Redis is
 * unavailable (e.g. local/test runs) this resolves to "skipped" and does NOT
 * throw - the ingestion_documents row is the durable source of truth and the
 * worker will catch up on reconnect.
 */
export async function publishIngestJob(
  payload: IngestJobPayload,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.INGEST_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("[audit] ingest.enqueue.skipped: INGEST_REDIS_URL not configured", {
      job: randomUUID(),
    });
    return "skipped";
  }

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(INGEST_QUEUE, { connection: redisUrl });
    const jobId = stableIngestJobId(payload);
    await queue.add(INGEST_JOB_NAME, payload, {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[audit] ingest.enqueue.failed", { error: String(err) });
    return "skipped";
  }
}

/**
 * Enqueue an OAuth-complete job for the ingest worker (B2). The worker performs
 * the token exchange and stores the tokens encrypted at rest. Best-effort: if
 * Redis is unavailable the job is "skipped" and the caller should surface that.
 */
export async function publishOauthCompleteJob(
  payload: OauthCompletePayload,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.INGEST_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("[audit] ingest.oauth.enqueue.skipped: INGEST_REDIS_URL not configured", {
      sourceId: payload.sourceId,
    });
    return "skipped";
  }

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(INGEST_QUEUE, { connection: redisUrl });
    const jobId = stableOauthJobId(payload);
    await queue.add(INGEST_OAUTH_JOB_NAME, payload, {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[audit] ingest.oauth.enqueue.failed", { error: String(err) });
    return "skipped";
  }
}

/** Test helper — expose stable jobId computation. */
export function _stableIngestJobId(payload: IngestJobPayload): string | undefined {
  return stableIngestJobId(payload);
}
export function _stableOauthJobId(payload: OauthCompletePayload): string {
  return stableOauthJobId(payload);
}
