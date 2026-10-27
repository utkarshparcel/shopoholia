import { eq, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { jobDeadLetters } from "../schema/jobs.js";
import { pushEvents } from "../schema/push-events.js";

/** Longest error text kept per dead letter. */
export const DEAD_LETTER_ERROR_MAX = 4_000;

export type JobDeadLetterInput = {
  queue: string;
  jobId: string;
  jobName: string;
  /** Ids only (see jobDeadLetters.data). */
  data: Record<string, unknown>;
  error: string;
  attemptsMade: number;
  failedAt?: Date;
};

/**
 * Upserts the dead letter for (queue, jobId): safe to call twice, and a job that dead-letters
 * again (after a manual retry) keeps one row with its latest error.
 */
export async function recordJobDeadLetter(
  db: Db,
  input: JobDeadLetterInput,
): Promise<{ id: string }> {
  const error = input.error.slice(0, DEAD_LETTER_ERROR_MAX);
  const failedAt = input.failedAt ?? new Date();
  const [row] = await db
    .insert(jobDeadLetters)
    .values({
      queue: input.queue,
      jobId: input.jobId,
      jobName: input.jobName,
      data: input.data,
      error,
      attemptsMade: input.attemptsMade,
      failedAt,
    })
    .onConflictDoUpdate({
      target: [jobDeadLetters.queue, jobDeadLetters.jobId],
      set: {
        jobName: input.jobName,
        data: input.data,
        error,
        attemptsMade: input.attemptsMade,
        failedAt,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: jobDeadLetters.id });
  return { id: row!.id };
}

export type PushEventInsert = typeof pushEvents.$inferInsert & { dedupeKey: string };

/**
 * Inserts a push_events row unless its dedupe key exists, and returns the row either way, so a
 * worker that runs a job twice sees the first run's status (SENT means don't send again).
 */
export async function recordPushEventIfNew(
  db: Db,
  values: PushEventInsert,
): Promise<{ id: string; status: "QUEUED" | "SENT" | "FAILED"; created: boolean }> {
  const [row] = await db
    .insert(pushEvents)
    .values(values)
    .onConflictDoNothing({ target: pushEvents.dedupeKey })
    .returning({ id: pushEvents.id, status: pushEvents.status });
  if (row) return { ...row, created: true };
  const [existing] = await db
    .select({ id: pushEvents.id, status: pushEvents.status })
    .from(pushEvents)
    .where(eq(pushEvents.dedupeKey, values.dedupeKey))
    .limit(1);
  if (!existing) {
    // Conflicted, then the row went (user erased mid-job): fail so the job retries or dead-letters.
    throw new Error(`push event ${values.dedupeKey} conflicted but no longer exists`);
  }
  return { ...existing, created: false };
}
