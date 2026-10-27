import {
  CalEventOutfitJobSchema,
  CoolingOffReleaseJobSchema,
  DEFAULT_TIME_ZONE,
  EmiDueJobSchema,
  FitPreviewJobSchema,
  GMAIL_TOKEN_REVOKE_QUEUE,
  GmailTokenRevokeJobSchema,
  INGESTION_RETENTION_QUEUE,
  IngestDeadLetterJobSchema,
  IngestionRetentionJobSchema,
  InterviewKitReminderJobSchema,
  LentOverdueJobSchema,
  PRIVACY_ERASE_QUEUE,
  PRIVACY_EXPORT_QUEUE,
  PlayStoreReconcileJobSchema,
  PriceDropNotifyJobSchema,
  PrivacyEraseJobSchema,
  PrivacyExportJobSchema,
  RetentionSweepJobSchema,
  WardrobeDiscardPurgeJobSchema,
  WardrobeTryonJobSchema,
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
import { FIT_PREVIEW_QUEUE, failFitPreviewJob, handleFitPreview } from "./fit-preview.js";
import { gmailTokenRevoke } from "./gmail-token-revoke.js";
import { INGEST_DEAD_LETTER_QUEUE, handleIngestDeadLetter } from "./ingest-dead-letter.js";
import { ingestionRetention } from "./ingestion-retention.js";
import { handleInterviewKitReminder } from "./interview-kit.js";
import { handleLentOverdue } from "./lent-overdue.js";
import { PLAY_STORE_RECONCILE_QUEUE, playStoreReconcile } from "./play-store-reconcile.js";
import { handlePriceDrop } from "./price-drop.js";
import { failPrivacyRequestJob, privacyErase } from "./privacy-erase.js";
import { privacyExport } from "./privacy-export.js";
import {
  RETENTION_SWEEP_JOB,
  RETENTION_SWEEP_QUEUE,
  handleRetentionSweep,
} from "./retention-sweep.js";
import { defineJob, type JobDefinition, type JobSchedule } from "./runner.js";
import { WARDROBE_DISCARD_PURGE_QUEUE, handleWardrobeDiscardPurge } from "./wardrobe-discard-purge.js";
import { WARDROBE_TRYON_QUEUE, failWardrobeTryonJob, handleWardrobeTryon } from "./wardrobe-tryon.js";

/** A render polls the provider for up to ~2 minutes; well under RENDER_CLAIM_STALE_MS (10 min). */
const RENDER_TIMEOUT_MS = 5 * 60_000;

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
  defineJob({
    queue: WARDROBE_TRYON_QUEUE,
    schema: WardrobeTryonJobSchema,
    handle: handleWardrobeTryon,
    concurrency: 4,
    timeoutMs: RENDER_TIMEOUT_MS,
    onFinalFailure: failWardrobeTryonJob,
  }),
  defineJob({
    queue: FIT_PREVIEW_QUEUE,
    schema: FitPreviewJobSchema,
    handle: handleFitPreview,
    concurrency: 4,
    timeoutMs: RENDER_TIMEOUT_MS,
    onFinalFailure: failFitPreviewJob,
  }),
  defineJob({
    queue: WARDROBE_DISCARD_PURGE_QUEUE,
    schema: WardrobeDiscardPurgeJobSchema,
    handle: handleWardrobeDiscardPurge,
  }),
  defineJob({
    queue: PRIVACY_ERASE_QUEUE,
    schema: PrivacyEraseJobSchema,
    handle: privacyErase,
    timeoutMs: 15 * 60_000,
    onFinalFailure: failPrivacyRequestJob,
  }),
  defineJob({
    queue: PRIVACY_EXPORT_QUEUE,
    schema: PrivacyExportJobSchema,
    handle: privacyExport,
    timeoutMs: 15 * 60_000,
    onFinalFailure: failPrivacyRequestJob,
  }),
  defineJob({ queue: GMAIL_TOKEN_REVOKE_QUEUE, schema: GmailTokenRevokeJobSchema, handle: gmailTokenRevoke }),
  defineJob({
    queue: INGESTION_RETENTION_QUEUE,
    schema: IngestionRetentionJobSchema,
    handle: async (data, deps) => {
      await ingestionRetention(data, deps, deps.now().getTime());
    },
    timeoutMs: 15 * 60_000,
  }),
  defineJob({
    queue: PLAY_STORE_RECONCILE_QUEUE,
    schema: PlayStoreReconcileJobSchema,
    handle: async (data, deps) => {
      const summary = await playStoreReconcile(data, deps);
      deps.log.info(summary, "[play] reconcile done");
    },
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
  {
    // Audit rows past a year and export files past 7 days (plus the same ingestion purge).
    id: "ingestion-retention-daily",
    queue: INGESTION_RETENTION_QUEUE,
    jobName: "ingestion-retention",
    pattern: "30 3 * * *",
    tz: DEFAULT_TIME_ZONE,
  },
  {
    id: "play-store-reconcile-daily",
    queue: PLAY_STORE_RECONCILE_QUEUE,
    jobName: "play-store-reconcile",
    pattern: "0 4 * * *",
    tz: DEFAULT_TIME_ZONE,
  },
];
