import type { RetentionSweepJob } from "@worn/shared";
import { purgeExpiredIngestionDocuments } from "../lib/retention.js";
import type { JobDeps } from "./deps.js";

export const RETENTION_SWEEP_QUEUE = "retention-sweep";
export const RETENTION_SWEEP_JOB = "retention-sweep";

/**
 * retention-sweep (daily, see JOB_SCHEDULES): the same purge as POST /admin/ingestion/retention/purge.
 * Safe to run twice: a purged document has no raw key left, so the next run skips it.
 */
export async function handleRetentionSweep(_data: RetentionSweepJob, deps: JobDeps): Promise<void> {
  const result = await purgeExpiredIngestionDocuments(
    deps.repos,
    deps.storage,
    deps.log,
    deps.now().getTime(),
  );
  deps.log.info(
    { checked: result.checked, purged: result.purged, purgedByKind: result.purgedByKind },
    "[retention] sweep done",
  );
}
