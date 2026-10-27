import { IngestionRetentionJobSchema } from "@worn/shared";
import type { FastifyBaseLogger } from "fastify";
import type { AppDeps } from "../lib/deps.js";
import { purgeExpiredIngestionDocuments, type RetentionResult } from "../lib/retention.js";

export type IngestionRetentionDeps = Pick<AppDeps, "repos" | "storage"> & { log: FastifyBaseLogger };

const DAY_MS = 24 * 60 * 60 * 1000;
/** audit_log rows are kept a year. */
export const AUDIT_RETENTION_DAYS = 365;
/** Export files are downloadable for 7 days. */
export const EXPORT_FILE_RETENTION_DAYS = 7;
const AUDIT_PURGE_BATCH = 1_000;
const AUDIT_PURGE_MAX_BATCHES = 20;
const EXPORT_PURGE_BATCH = 200;

/**
 * Scheduled retention sweep. Each part is bounded per run and safe to run twice (a rerun only
 * finds what is still past its cutoff):
 * - raw ingestion objects past their kind's TTL, every status (lib/retention.ts);
 * - audit_log rows older than AUDIT_RETENTION_DAYS;
 * - export files older than EXPORT_FILE_RETENTION_DAYS.
 * Throws after the sweep when any object could not be deleted, so the failure is retried and
 * shows up in the dead-letter queue instead of passing silently.
 */
export async function ingestionRetention(
  data: unknown,
  deps: IngestionRetentionDeps,
  now = Date.now(),
): Promise<RetentionResult & { auditPurged: number; exportsPurged: number }> {
  const { batchSize } = IngestionRetentionJobSchema.parse(data ?? {});
  const { repos, storage, log } = deps;

  const result = await purgeExpiredIngestionDocuments(repos, storage, log, now, { batchSize });

  let auditPurged = 0;
  const auditCutoff = new Date(now - AUDIT_RETENTION_DAYS * DAY_MS);
  for (let i = 0; i < AUDIT_PURGE_MAX_BATCHES; i++) {
    const n = await repos.purgeAuditRecordsBefore(auditCutoff, AUDIT_PURGE_BATCH);
    auditPurged += n;
    if (n < AUDIT_PURGE_BATCH) break;
  }

  let exportsPurged = 0;
  let exportFailures = 0;
  const exports = await repos.listExpiredPrivacyExports(
    new Date(now - EXPORT_FILE_RETENTION_DAYS * DAY_MS),
    EXPORT_PURGE_BATCH,
  );
  for (const request of exports) {
    try {
      if (request.resultKey) await storage.delete(request.resultKey);
      await repos.updatePrivacyRequest(request.id, { resultKey: null });
      exportsPurged++;
    } catch (err) {
      exportFailures++;
      log.warn({ err, requestId: request.id }, "privacy.export.file_delete_failed");
    }
  }

  log.info(
    { purged: result.purged, failed: result.failed ?? 0, auditPurged, exportsPurged, exportFailures },
    "ingestion.retention.sweep",
  );
  const failures = (result.failed ?? 0) + exportFailures;
  if (failures > 0) {
    throw new Error(`ingestion-retention: ${failures} objects could not be deleted; retrying`);
  }
  return { ...result, auditPurged, exportsPurged };
}
