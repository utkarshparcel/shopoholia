import { deadLetterData, jobIdFrom, type IngestDeadLetterJob } from "@worn/shared";
import { captureException } from "../lib/sentry.js";
import type { JobDeps } from "./deps.js";

export const INGEST_DEAD_LETTER_QUEUE = "ingest-dead-letter";
/** The queue whose jobs services/worker-ingest dead-letters. */
const INGEST_SOURCE_QUEUE = "ingest-email";

/**
 * ingest-dead-letter: an ingest job that failed for good, copied to job_dead_letters (upsert on
 * queue + job id, so a rerun keeps one row) and raised as an alert. Ids only: the payload schema
 * has no message body, and deadLetterData drops free text again.
 */
export async function handleIngestDeadLetter(
  data: IngestDeadLetterJob,
  deps: JobDeps,
): Promise<void> {
  const jobId =
    data.jobId ?? jobIdFrom("ingest", data.kind, data.documentId ?? data.sourceId ?? data.timestamp);
  await deps.recordDeadLetter({
    queue: INGEST_SOURCE_QUEUE,
    jobId,
    jobName: `ingest-${data.kind.toLowerCase()}`,
    data: deadLetterData(data),
    error: data.error,
    attemptsMade: data.attempts,
    failedAt: new Date(data.timestamp),
  });
  const ids = { kind: data.kind, jobId, sourceId: data.sourceId, documentId: data.documentId };
  deps.log.error(ids, "[ingest] job dead-lettered");
  captureException(new Error(`ingest ${data.kind} job failed for good`), {
    tags: { queue: INGEST_SOURCE_QUEUE, job_id: jobId },
  });
}
