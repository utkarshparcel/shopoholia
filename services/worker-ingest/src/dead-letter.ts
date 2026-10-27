import { jobIdFrom, type DeadLetter, type IngestDeadLetterJob } from "@worn/shared";
import {
  INGEST_JOB_NAME,
  INGEST_OAUTH_JOB_NAME,
  INGEST_RESYNC_JOB_NAME,
} from "./queues.js";

export const INGEST_DEAD_LETTER_JOB_NAME = "dead-letter";
const MAX_ERROR_LENGTH = 1_000;

// Per-source exponential backoff state.
const backoffMap = new Map<string, { failures: number; lastFailureAt: number }>();

/**
 * The ingest-dead-letter message for an ingest job that failed for good: ids only. `entry.data`
 * has already been through deadLetterData, so message bodies and OAuth codes are gone.
 */
export function toIngestDeadLetter(entry: DeadLetter): IngestDeadLetterJob {
  const { data } = entry;
  const kind =
    entry.jobName === INGEST_OAUTH_JOB_NAME
      ? "OAUTH"
      : entry.jobName === INGEST_RESYNC_JOB_NAME
        ? "RESYNC"
        : entry.jobName === INGEST_JOB_NAME
          ? data.kind === "SMS"
            ? "SMS"
            : "EMAIL"
          : "UNKNOWN";
  return {
    kind,
    ...(typeof data.sourceId === "string" ? { sourceId: data.sourceId } : {}),
    ...(typeof data.documentId === "string" ? { documentId: data.documentId } : {}),
    jobId: entry.jobId,
    error: entry.error.slice(0, MAX_ERROR_LENGTH),
    attempts: entry.attemptsMade,
    timestamp: entry.failedAt.toISOString(),
  };
}

/**
 * Puts a dead letter on the ingest-dead-letter queue (the API runner copies it to
 * job_dead_letters). One message per failed job: a rerun reuses the job id, which BullMQ ignores.
 * Rejects when Redis can't take it, so the caller's alert says the copy is missing.
 */
export async function enqueueDeadLetterJob(
  queue: { add(name: string, data: IngestDeadLetterJob, opts: { jobId: string }): Promise<unknown> },
  entry: IngestDeadLetterJob,
): Promise<void> {
  await queue.add(INGEST_DEAD_LETTER_JOB_NAME, entry, {
    jobId: jobIdFrom("ingest-dl", entry.jobId ?? entry.timestamp),
  });
}

// Exponential backoff helpers — per ingestion_sources.id
export function recordFailure(sourceId: string): number {
  const cur = backoffMap.get(sourceId) ?? { failures: 0, lastFailureAt: 0 };
  const failures = cur.failures + 1;
  backoffMap.set(sourceId, { failures, lastFailureAt: Date.now() });
  return computeBackoffMs(failures);
}

export function recordSuccess(sourceId: string): void {
  backoffMap.delete(sourceId);
}

export function computeBackoffMs(failures: number): number {
  // base 2s, exponential, capped at 30 min
  const base = 2000;
  const ms = base * Math.pow(2, failures - 1);
  return Math.min(ms, 30 * 60 * 1000);
}

export function getBackoffDelay(sourceId: string): number {
  const cur = backoffMap.get(sourceId);
  if (!cur) return 0;
  const elapsed = Date.now() - cur.lastFailureAt;
  const needed = computeBackoffMs(cur.failures);
  return Math.max(0, needed - elapsed);
}

export function getBackoffState(): Record<string, { failures: number; delayMs: number }> {
  const out: Record<string, { failures: number; delayMs: number }> = {};
  for (const [k, v] of backoffMap) {
    out[k] = { failures: v.failures, delayMs: getBackoffDelay(k) };
  }
  return out;
}

export function clearBackoff(): void {
  backoffMap.clear();
}
