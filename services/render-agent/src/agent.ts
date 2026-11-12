import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { HttpError, type ApiClient, type LeasedJob } from "./api.js";
import { MediagenNotConfiguredError, RenderRejectedError, type RenderEngine } from "./mediagen.js";
import { checkRenderFiles, QualityCheckError } from "./quality.js";
import { inWindow, msUntilWindow, type AgentWindow } from "./window.js";

export type Log = (message: string, fields?: Record<string, unknown>) => void;

/** Whether another attempt might succeed. Expired signed URLs (403) are re-signed on the next lease. */
export function isRetryable(error: unknown): boolean {
  // Another render of the same job may well pass.
  if (error instanceof QualityCheckError) return true;
  if (error instanceof RenderRejectedError || error instanceof MediagenNotConfiguredError) return false;
  if (error instanceof HttpError && error.status !== undefined) {
    return error.status === 403 || error.status === 404 || error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return true;
}

function randomName(ext = ".jpg") {
  return `${randomBytes(12).toString("hex")}${ext}`;
}

/**
 * One job: inputs to a private temp dir under random names, the engine, the quality checks
 * (src/quality.ts), the upload through the signed PUT, then complete (or fail, retryable when another attempt might pass). The temp dir
 * is always deleted: the Mac keeps no copies.
 */
export async function runJob(
  job: LeasedJob,
  deps: { api: ApiClient; engine: RenderEngine; workDir: string; log: Log },
): Promise<"done" | "failed"> {
  await mkdir(deps.workDir, { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(join(deps.workDir, "job-"));
  try {
    const modelImagePath = join(dir, randomName());
    await deps.api.download(job.modelImageUrl, modelImagePath);
    const garmentImagePaths: string[] = [];
    for (const url of job.garmentImageUrls) {
      const path = join(dir, randomName());
      await deps.api.download(url, path);
      garmentImagePaths.push(path);
    }
    const outputPath = join(dir, randomName());
    await deps.engine.editTryOn({ modelImagePath, garmentImagePaths, scenario: job.scenario, outputPath });
    // A render that is not a usable image never goes up.
    await checkRenderFiles({ outputPath, modelImagePath, contentType: job.output.contentType });
    await deps.api.upload(job.output.url, outputPath, job.output.contentType);
    await deps.api.complete(job.id);
    deps.log("job done", { jobId: job.id, kind: job.kind, attempt: job.attempt });
    return "done";
  } catch (error) {
    const retryable = isRetryable(error);
    const reason = error instanceof Error ? error.message : "render failed";
    deps.log("job failed", { jobId: job.id, retryable, reason });
    try {
      await deps.api.fail(job.id, retryable, reason);
    } catch (reportError) {
      // The lease lapses and the API re-queues the job.
      deps.log("could not report the failure", { jobId: job.id, error: String(reportError) });
    }
    if (error instanceof MediagenNotConfiguredError) throw error;
    return "failed";
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type LoopDeps = {
  api: ApiClient;
  engine: RenderEngine;
  workDir: string;
  window: AgentWindow;
  timeZone: string;
  version: string;
  pollMs: number;
  heartbeatMs: number;
  maxJobs: number;
  log: Log;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
};

/** Outside the window the agent re-checks at least this often (clock changes, a moved window). */
const MAX_IDLE_SLEEP_MS = 5 * 60_000;

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * The agent's loop. Inside the window: a heartbeat every `heartbeatMs`, a lease every `pollMs`
 * (straight away again after a job, so a queue drains), one job at a time. Outside it: sleep.
 */
export async function runAgentLoop(deps: LoopDeps): Promise<void> {
  if (!deps.engine.configured) {
    throw new Error("The render engine is not configured (mediagen adapter stub): refusing to lease jobs");
  }
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  let lastHeartbeat = Number.NEGATIVE_INFINITY;

  const heartbeatIfDue = async () => {
    if (now().getTime() - lastHeartbeat < deps.heartbeatMs) return;
    try {
      await deps.api.heartbeat(deps.version);
      lastHeartbeat = now().getTime();
    } catch (error) {
      deps.log("heartbeat failed", { error: String(error) });
    }
  };

  while (!deps.signal?.aborted) {
    if (!inWindow(now(), deps.window, deps.timeZone)) {
      const wait = Math.min(msUntilWindow(now(), deps.window, deps.timeZone), MAX_IDLE_SLEEP_MS);
      deps.log("outside the window, sleeping", { ms: wait });
      await sleep(Math.max(wait, 1000), deps.signal);
      continue;
    }

    await heartbeatIfDue();
    let jobs: LeasedJob[] = [];
    try {
      jobs = await deps.api.lease(deps.maxJobs);
    } catch (error) {
      deps.log("lease failed", { error: String(error) });
    }
    for (const job of jobs) {
      if (deps.signal?.aborted) break;
      await runJob(job, deps);
      await heartbeatIfDue();
    }
    if (jobs.length === 0) await sleep(deps.pollMs, deps.signal);
  }
}
