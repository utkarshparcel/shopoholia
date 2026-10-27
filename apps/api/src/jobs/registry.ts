import {
  CalEventOutfitJobSchema,
  CoolingOffReleaseJobSchema,
  DEFAULT_TIME_ZONE,
  EmiDueJobSchema,
  IngestDeadLetterJobSchema,
  InterviewKitReminderJobSchema,
  LentOverdueJobSchema,
  PriceDropNotifyJobSchema,
  RetentionSweepJobSchema,
} from "@worn/shared";
import { CAL_EVENT_OUTFIT_QUEUE } from "../lib/cal-event-outfit.js";
import { COOLING_OFF_QUEUE } from "../lib/cooling-off-jobs.js";
import { EMI_QUEUE } from "../lib/emi-jobs.js";
import { INTERVIEW_KIT_QUEUE } from "../lib/interview-kit.js";
import { LENT_OVERDUE_QUEUE } from "../lib/borrow-lent-jobs.js";
import { PRICE_DROP_QUEUE } from "../lib/price-drop.js";
import { handleCalEventOutfit } from "./cal-event-outfit.js";
import { handleCoolingOffRelease } from "./cooling-off-release.js";
import type { JobDeps } from "./deps.js";
import { handleEmiDue } from "./emi-due.js";
import { INGEST_DEAD_LETTER_QUEUE, handleIngestDeadLetter } from "./ingest-dead-letter.js";
import { handleInterviewKitReminder } from "./interview-kit.js";
import { handleLentOverdue } from "./lent-overdue.js";
import { handlePriceDrop } from "./price-drop.js";
import {
  RETENTION_SWEEP_JOB,
  RETENTION_SWEEP_QUEUE,
  handleRetentionSweep,
} from "./retention-sweep.js";
import { defineJob, type JobDefinition, type JobSchedule } from "./runner.js";

/**
 * Every queue the API worker (src/worker.ts) consumes: one line each. A new handler is an
 * exported `async (data, deps) => void` in src/jobs/<name>.ts plus a line here.
 */
export const JOB_HANDLERS: JobDefinition<JobDeps>[] = [
  defineJob({ queue: CAL_EVENT_OUTFIT_QUEUE, schema: CalEventOutfitJobSchema, handle: handleCalEventOutfit }),
  defineJob({ queue: COOLING_OFF_QUEUE, schema: CoolingOffReleaseJobSchema, handle: handleCoolingOffRelease }),
  defineJob({ queue: EMI_QUEUE, schema: EmiDueJobSchema, handle: handleEmiDue }),
  defineJob({ queue: INTERVIEW_KIT_QUEUE, schema: InterviewKitReminderJobSchema, handle: handleInterviewKitReminder }),
  defineJob({ queue: LENT_OVERDUE_QUEUE, schema: LentOverdueJobSchema, handle: handleLentOverdue }),
  defineJob({ queue: PRICE_DROP_QUEUE, schema: PriceDropNotifyJobSchema, handle: handlePriceDrop }),
  defineJob({ queue: INGEST_DEAD_LETTER_QUEUE, schema: IngestDeadLetterJobSchema, handle: handleIngestDeadLetter }),
  defineJob({
    queue: RETENTION_SWEEP_QUEUE,
    schema: RetentionSweepJobSchema,
    handle: handleRetentionSweep,
    timeoutMs: 15 * 60_000,
  }),
];

/** Every periodic job (BullMQ Job Scheduler). A schedule's queue must be in JOB_HANDLERS. */
export const JOB_SCHEDULES: JobSchedule[] = [
  {
    id: "retention-sweep-daily",
    queue: RETENTION_SWEEP_QUEUE,
    jobName: RETENTION_SWEEP_JOB,
    pattern: "0 3 * * *",
    tz: DEFAULT_TIME_ZONE,
  },
];
