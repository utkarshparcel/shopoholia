import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.js";

/**
 * Background jobs that failed for good (last attempt, or a payload that can never succeed).
 * One row per (queue, job id): a job that dead-letters again updates its row.
 */
export const jobDeadLetters = pgTable(
  "job_dead_letters",
  {
    id: id(),
    queue: text("queue").notNull(),
    jobId: text("job_id").notNull(),
    jobName: text("job_name").notNull(),
    /** Ids and small scalars only: never raw email, OAuth codes or other secrets. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error").notNull(),
    attemptsMade: integer("attempts_made").notNull(),
    failedAt: timestamp("failed_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("job_dead_letters_queue_job_idx").on(table.queue, table.jobId),
    index("job_dead_letters_failed_at_idx").on(table.failedAt),
  ],
);

export type JobDeadLetterRow = typeof jobDeadLetters.$inferSelect;
