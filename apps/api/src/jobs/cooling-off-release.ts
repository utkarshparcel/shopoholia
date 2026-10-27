import { settlePushResult, type CoolingOffReleaseJob } from "@worn/shared";
import { COOLING_OFF_QUEUE, processCoolingOffRelease } from "../lib/cooling-off-jobs.js";
import type { JobDeps } from "./deps.js";

/** cooling-off-release: tells the user the 24h hold is over, unless it was cleared since. */
export async function handleCoolingOffRelease(
  data: CoolingOffReleaseJob,
  deps: JobDeps,
): Promise<void> {
  settlePushResult(
    COOLING_OFF_QUEUE,
    await processCoolingOffRelease(
      // A hold only ever starts from the apparel budget (pickApparelBudgetOverage).
      { ...data, category: data.category ?? "apparel" },
      deps.repos,
      { now: deps.now() },
    ),
  );
}
