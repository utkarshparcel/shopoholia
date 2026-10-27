import { settlePushResult, type EmiDueJob } from "@worn/shared";
import { EMI_QUEUE, processEmiDueNudge } from "../lib/emi-jobs.js";
import type { JobDeps } from "./deps.js";

/** emi-due: the EMI-due push, unless the plan was paid, closed or moved since. */
export async function handleEmiDue(data: EmiDueJob, deps: JobDeps): Promise<void> {
  settlePushResult(EMI_QUEUE, await processEmiDueNudge(data, deps.repos, { now: deps.now() }));
}
