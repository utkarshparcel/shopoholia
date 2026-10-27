import { settlePushResult, type PriceDropNotifyJob } from "@worn/shared";
import { PRICE_DROP_QUEUE, processPriceDropNotify } from "../lib/price-drop.js";
import type { JobDeps } from "./deps.js";

/** price-drop: the price-drop push, unless the watch was paused or deleted since the scan. */
export async function handlePriceDrop(data: PriceDropNotifyJob, deps: JobDeps): Promise<void> {
  settlePushResult(PRICE_DROP_QUEUE, await processPriceDropNotify(data, deps.repos, { now: deps.now() }));
}
