export const INGEST_QUEUE = "ingest-email";
export const INGEST_JOB_NAME = "email-received";
export const INGEST_RESYNC_JOB_NAME = "email-resync";
export const INGEST_OAUTH_JOB_NAME = "email-oauth";
export const INGEST_DEAD_LETTER_QUEUE = "ingest-dead-letter";

export const QUEUE_NAMES = {
  INGEST_EMAIL: INGEST_QUEUE,
  INGEST_DEAD_LETTER: INGEST_DEAD_LETTER_QUEUE,
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
