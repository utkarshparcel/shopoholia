import { settlePushResult, type LentOverdueJob } from "@worn/shared";
import { LENT_OVERDUE_QUEUE, processLentOverdueNudge } from "../lib/borrow-lent-jobs.js";
import type { JobDeps } from "./deps.js";

/** lent-overdue: the overdue push, unless the item came back, is gone or was lent again. */
export async function handleLentOverdue(data: LentOverdueJob, deps: JobDeps): Promise<void> {
  settlePushResult(
    LENT_OVERDUE_QUEUE,
    await processLentOverdueNudge(data, deps.repos, { now: deps.now() }),
  );
}
