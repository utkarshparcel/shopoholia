import type { RenderScenario } from "@worn/shared";
import type { AgentJobLease, RenderRecord, Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";
import type { PushService } from "../push/stub.js";
import type { JobQueue } from "../jobs/queue.js";
import { newJobId } from "../jobs/avatar-processing.js";
import { TRYON_RETRY_AFTER_MS } from "../jobs/tryon-processing.js";
import { checkAndMarkRevealReady, paidCoinsForRender, renderInputs, RenderInputError } from "./pipeline.js";
import { AGENT_PROVIDER_NAME } from "./provider.js";
import { inAgentWindow, nextWindowStart, windowEndAfter, type RenderConfig } from "./backend.js";

/** Lease owner of jobs the API hands to FASHN as overflow. */
export const OVERFLOW_OWNER = "fashn-overflow";

/** Signed input and output URLs last this long: a render takes about a minute. */
export const AGENT_URL_SECONDS = 15 * 60;

export const AGENT_OUTPUT_CONTENT_TYPE = "image/jpeg";

/** How many jobs one overflow sweep hands to the in-process queue. */
const OVERFLOW_BATCH = 3;

export type AgentJobsDeps = {
  repos: Repositories;
  storage: StorageClient;
  push: PushService;
  config: RenderConfig;
};

/**
 * What the agent sees of a job: ids, the scene, and signed URLs. No user ids or other personal
 * data, and no storage keys.
 */
export type AgentJobView = {
  id: string;
  kind: "render" | "tryon";
  /** The scene to render; null for a plain try-on preview. */
  scenario: RenderScenario | null;
  attempt: number;
  leaseExpiresAt: string;
  modelImageUrl: string;
  garmentImageUrls: string[];
  output: { url: string; method: "PUT"; contentType: string };
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Where the agent's image goes: a key per job and attempt, outside the user's prefix so the
 * signed URL carries no user id. The key is recorded on the render or preview, so account
 * erasure finds it there, as it does FASHN's `tryon/fashn/…` keys.
 */
export function agentOutputKey(job: Pick<AgentJobLease, "kind" | "id" | "attempts">): string {
  return job.kind === "render"
    ? `renders/agent/${job.id}-${job.attempts}.jpg`
    : `tryon/agent/${job.id}-${job.attempts}.jpg`;
}

async function signGet(storage: StorageClient, key: string) {
  return isHttpUrl(key) ? key : storage.getSignedUrl(key, AGENT_URL_SECONDS);
}

async function jobInputs(deps: AgentJobsDeps, job: AgentJobLease) {
  if (job.kind === "render") {
    const order = await deps.repos.findOrderById(job.orderId);
    if (!order) throw new RenderInputError("The render's order is gone");
    const { modelImageKey, garments } = await renderInputs(deps, job.render, job.orderId, order);
    return { modelImageKey, garmentImageKeys: garments.map((g) => g.garmentImageKey) };
  }
  const preview = job.preview;
  const avatar = await deps.repos.findAvatarByUserId(preview.userId);
  if (avatar?.status !== "READY" || !avatar.referenceImageKey) throw new RenderInputError("No avatar to render on");
  const variant = preview.listingVariantId ? await deps.repos.findVariantById(preview.listingVariantId) : null;
  if (!variant) throw new RenderInputError("No garment to render");
  return { modelImageKey: avatar.referenceImageKey, garmentImageKeys: [variant.garmentImageKey] };
}

async function viewFor(deps: AgentJobsDeps, job: AgentJobLease): Promise<AgentJobView> {
  const signPut = deps.storage.getSignedPutUrl;
  if (!signPut) throw new Error("Storage can't sign uploads: the render agent needs R2");
  const inputs = await jobInputs(deps, job);
  const [modelImageUrl, ...garmentImageUrls] = await Promise.all(
    [inputs.modelImageKey, ...inputs.garmentImageKeys].map((key) => signGet(deps.storage, key)),
  );
  return {
    id: job.id,
    kind: job.kind,
    scenario: job.kind === "render" ? job.render.scenario : null,
    attempt: job.attempts,
    leaseExpiresAt: (job.leaseExpiresAt ?? new Date()).toISOString(),
    modelImageUrl: modelImageUrl!,
    garmentImageUrls,
    output: {
      url: await signPut.call(deps.storage, agentOutputKey(job), AGENT_OUTPUT_CONTENT_TYPE, AGENT_URL_SECONDS),
      method: "PUT",
      contentType: AGENT_OUTPUT_CONTENT_TYPE,
    },
  };
}

/**
 * Ends a job FAILED for good: a render through `failRender` (refunding a paid one once) and, for
 * a free one, perhaps opening the reveal; a preview FAILED with its retry-after.
 */
async function failJob(deps: AgentJobsDeps, job: AgentJobLease, reason: string) {
  if (job.kind === "render") {
    const order = await deps.repos.findOrderById(job.orderId);
    const coins = paidCoinsForRender(job.render);
    const result = await deps.repos.failRender({
      renderId: job.id,
      refund: coins > 0 && order ? { userId: order.userId, coins } : null,
    });
    if (job.render.isFree) {
      await checkAndMarkRevealReady({ repos: deps.repos, push: deps.push, orderId: job.orderId });
    }
    return result.coinsRefunded;
  }
  await deps.repos.updateTryonPreviewById(job.id, {
    status: "FAILED",
    imageKey: null,
    error: reason.slice(0, 500),
    retryAfter: new Date(Date.now() + TRYON_RETRY_AFTER_MS),
  });
  return 0;
}

/** Back to the queue for another lease (a preview is waiting again once its lease is cleared). */
async function requeueJob(deps: AgentJobsDeps, job: AgentJobLease) {
  if (job.kind === "render") await deps.repos.updateRender(job.id, { status: "QUEUED" });
}

/**
 * Leases that lapsed (an agent that went away mid-job) go back to the queue, or fail once the
 * job has used its attempts.
 */
export async function reclaimExpiredLeases(deps: AgentJobsDeps, now = new Date()) {
  const expired = await deps.repos.listExpiredAgentLeases(now);
  let requeued = 0;
  let failed = 0;
  for (const job of expired) {
    if (!job.leaseOwner) continue;
    const released = await deps.repos.releaseAgentLease({
      kind: job.kind,
      id: job.id,
      owner: job.leaseOwner,
      expiredBy: now,
    });
    if (!released) continue;
    if (released.attempts >= deps.config.maxAttempts) {
      await failJob(deps, released, "The render's lease expired too many times");
      failed += 1;
    } else {
      await requeueJob(deps, released);
      requeued += 1;
    }
  }
  return { requeued, failed };
}

/** POST /agent/renders/lease: up to `max` jobs for `agentId`, oldest first. */
export async function leaseJobsForAgent(
  deps: AgentJobsDeps,
  input: { agentId: string; max: number },
  now = new Date(),
): Promise<AgentJobView[]> {
  if (deps.config.backend !== "agent") return [];
  await reclaimExpiredLeases(deps, now);
  const views: AgentJobView[] = [];
  // A job that can't render (no photo or garment) fails here and frees its slot, so lease again
  // (a few rounds at most) rather than hand the agent nothing while good jobs wait.
  for (let round = 0; round < LEASE_ROUNDS && views.length < input.max; round += 1) {
    const leases = await deps.repos.leaseAgentJobs({
      owner: input.agentId,
      max: input.max - views.length,
      now,
      leaseExpiresAt: new Date(now.getTime() + deps.config.leaseMs),
    });
    if (leases.length === 0) break;
    views.push(...(await viewsFor(deps, leases, input.agentId)));
  }
  return views;
}

const LEASE_ROUNDS = 5;

async function viewsFor(deps: AgentJobsDeps, leases: AgentJobLease[], agentId: string) {
  const views: AgentJobView[] = [];
  for (const job of leases) {
    try {
      views.push(await viewFor(deps, job));
    } catch (error) {
      // A job with no photo or garment can't render on any attempt: it fails now.
      const released = await deps.repos.releaseAgentLease({ kind: job.kind, id: job.id, owner: agentId });
      if (!released) continue;
      if (error instanceof RenderInputError) {
        await failJob(deps, released, error.message);
      } else {
        await requeueJob(deps, released);
        throw error;
      }
    }
  }
  return views;
}

async function findJob(repos: Repositories, id: string): Promise<{ kind: "render" | "tryon"; attempts: number } | null> {
  const render = await repos.findRenderById(id);
  if (render) return { kind: "render", attempts: render.attempts ?? 0 };
  const preview = await repos.findTryonPreviewById(id);
  if (preview) return { kind: "tryon", attempts: preview.attempts ?? 0 };
  return null;
}

export type CompleteOutcome = "done" | "not_found" | "not_leased" | "output_missing";

/**
 * POST /agent/renders/:id/complete: the agent uploaded the image. Marks the job done with it;
 * a free render may then open the reveal (and send its push), as the in-process path does.
 */
export async function completeAgentJob(
  deps: AgentJobsDeps,
  input: { id: string; agentId: string },
): Promise<CompleteOutcome> {
  const found = await findJob(deps.repos, input.id);
  if (!found) return "not_found";
  const outputKey = agentOutputKey({ kind: found.kind, id: input.id, attempts: found.attempts });
  const exists = deps.storage.exists;
  if (!exists || !(await exists.call(deps.storage, outputKey))) return "output_missing";
  const job = await deps.repos.releaseAgentLease({ kind: found.kind, id: input.id, owner: input.agentId });
  if (!job) return "not_leased";

  if (job.kind === "render") {
    await deps.repos.updateRender(job.id, {
      status: "DONE",
      imageKey: outputKey,
      provider: AGENT_PROVIDER_NAME,
      costMicros: 0,
    });
    if (job.render.isFree) {
      await checkAndMarkRevealReady({ repos: deps.repos, push: deps.push, orderId: job.orderId });
    }
  } else {
    await deps.repos.updateTryonPreviewById(job.id, {
      status: "READY",
      imageKey: outputKey,
      error: null,
      retryAfter: null,
      provider: AGENT_PROVIDER_NAME,
      costMicros: 0,
    });
  }
  return "done";
}

export type FailOutcome =
  | { status: "requeued" | "failed"; coinsRefunded: number }
  | { status: "not_found" | "not_leased" };

/**
 * POST /agent/renders/:id/fail: a retryable failure goes back to the queue until the job has
 * used its attempts; past them, or when not retryable, the job fails (a paid render refunded).
 */
export async function failAgentJob(
  deps: AgentJobsDeps,
  input: { id: string; agentId: string; retryable: boolean; reason: string },
): Promise<FailOutcome> {
  const found = await findJob(deps.repos, input.id);
  if (!found) return { status: "not_found" };
  const job = await deps.repos.releaseAgentLease({ kind: found.kind, id: input.id, owner: input.agentId });
  if (!job) return { status: "not_leased" };
  if (input.retryable && job.attempts < deps.config.maxAttempts) {
    await requeueJob(deps, job);
    return { status: "requeued", coinsRefunded: 0 };
  }
  const coinsRefunded = await failJob(deps, job, input.reason || "The render agent could not render this");
  return { status: "failed", coinsRefunded };
}

/** Whether the agent has checked in within `heartbeatStaleMs` of `now`. */
export function agentAlive(config: RenderConfig, lastHeartbeatAt: Date | null, now: Date): boolean {
  return lastHeartbeatAt !== null && now.getTime() - lastHeartbeatAt.getTime() <= config.heartbeatStaleMs;
}

/**
 * What FASHN overflow may take now: `all` waiting jobs (outside the window, or the agent is
 * down), only those `waited` past RENDER_OVERFLOW_AFTER_MINUTES, or `none` (overflow is off).
 */
export function overflowMode(
  config: RenderConfig,
  input: { now: Date; lastHeartbeatAt: Date | null },
): "all" | "waited" | "none" {
  if (config.backend !== "agent" || !config.overflowReady) return "none";
  if (!inAgentWindow(input.now, config.window, config.timeZone)) return "all";
  if (!agentAlive(config, input.lastHeartbeatAt, input.now)) return "all";
  return "waited";
}

/**
 * When a delivered order's renders should be ready, if the app should say so instead of a
 * spinner: the agent is down, the queue is backed up, or the window is closed. `waiting` is
 * false when renders are on their way now. `expectedReadyAt` is null when there is no estimate
 * (the agent is down with no window to count from): the app then says "shortly".
 */
export function renderWaitEstimate(
  config: RenderConfig,
  input: { now: Date; lastHeartbeatAt: Date | null; pending: boolean; queueDepth: number },
): { waiting: boolean; expectedReadyAt: string | null } {
  const notWaiting = { waiting: false, expectedReadyAt: null };
  if (config.backend !== "agent" || !input.pending) return notWaiting;
  // FASHN takes the jobs right away.
  if (overflowMode(config, input) === "all") return notWaiting;
  const { now } = input;
  const inWindow = inAgentWindow(now, config.window, config.timeZone);
  const alive = agentAlive(config, input.lastHeartbeatAt, now);
  const queueMs = Math.max(1, input.queueDepth) * config.avgRenderSeconds * 1000;
  const backedUp = queueMs > config.readyMarginMs;

  if (inWindow && alive && !backedUp) return notWaiting;
  // Inside the window with the agent down: no telling when it is back.
  if (inWindow && !alive) return { waiting: true, expectedReadyAt: null };
  // From when the window opens (now, inside it), through the queue, never past its end.
  const start = inWindow ? now : nextWindowStart(now, config.window, config.timeZone);
  const end = windowEndAfter(now, config.window, config.timeZone);
  const done = start.getTime() + queueMs;
  const estimate = (end ? Math.min(done, end.getTime()) : done) + config.readyMarginMs;
  return { waiting: true, expectedReadyAt: new Date(estimate).toISOString() };
}

/**
 * The wait estimate for work that is `pending` for the agent now; reads the last heartbeat and
 * the queue depth only when it is. Shared by the reveal and the try-on preview.
 */
export async function agentWaitEstimate(
  deps: Pick<AgentJobsDeps, "repos" | "config">,
  pending: boolean,
  now = new Date(),
): Promise<{ waiting: boolean; expectedReadyAt: string | null }> {
  if (deps.config.backend !== "agent" || !pending) return { waiting: false, expectedReadyAt: null };
  const [lastHeartbeatAt, queueDepth] = await Promise.all([
    deps.repos.latestAgentHeartbeat(),
    deps.repos.countWaitingAgentJobs(),
  ]);
  return renderWaitEstimate(deps.config, { now, lastHeartbeatAt, pending, queueDepth });
}

/** The wait estimate for one order's reveal. */
export async function revealWaitEstimate(
  deps: Pick<AgentJobsDeps, "repos" | "config">,
  orderRenders: RenderRecord[],
  now = new Date(),
) {
  const pending = orderRenders.some((r) => r.unlocked && (r.status === "QUEUED" || r.status === "RUNNING"));
  return agentWaitEstimate(deps, pending, now);
}

/** The wait estimate for a listing try-on preview, while it is still PROCESSING. */
export async function tryonWaitEstimate(
  deps: Pick<AgentJobsDeps, "repos" | "config">,
  preview: { status: string },
  now = new Date(),
) {
  return agentWaitEstimate(deps, preview.status === "PROCESSING", now);
}

/** Hands overflow-leased jobs to the in-process queue (FASHN). */
async function dispatchToInner(deps: AgentJobsDeps, inner: JobQueue, jobs: AgentJobLease[]) {
  for (const job of jobs) {
    if (job.kind === "render") {
      await inner.enqueueRender({ renderId: job.id, orderId: job.orderId });
      continue;
    }
    try {
      const inputs = await jobInputs(deps, job);
      await inner.enqueueTryonProcessing({
        jobId: newJobId(),
        userId: job.preview.userId,
        listingVariantId: job.preview.listingVariantId!,
        modelImageKey: inputs.modelImageKey,
        garmentImageKey: inputs.garmentImageKeys[0]!,
      });
    } catch (error) {
      if (!(error instanceof RenderInputError)) throw error;
      await failJob(deps, job, error.message);
    }
  }
}

export type AgentJobQueue = JobQueue & {
  /** Reclaims lapsed leases, hands due jobs to overflow, and reports an agent that is down. */
  sweep(now?: Date): Promise<{ overflowed: number; agentDown: boolean }>;
};

/**
 * RENDER_BACKEND=agent: renders and try-on previews stay queued in the database for the agent
 * instead of running here. FASHN (`inner`, the in-process queue) gets one only as overflow.
 */
export function createAgentJobQueue(
  inner: JobQueue,
  deps: AgentJobsDeps & { onAgentDown?: (info: { queued: number; lastHeartbeatAt: Date | null }) => void },
): AgentJobQueue {
  const overflowNow = async (ids: string[]) => {
    const now = new Date();
    const lastHeartbeatAt = await deps.repos.latestAgentHeartbeat();
    if (overflowMode(deps.config, { now, lastHeartbeatAt }) !== "all") return;
    const leased = await deps.repos.leaseAgentJobs({
      owner: OVERFLOW_OWNER,
      ids,
      max: ids.length,
      now,
      leaseExpiresAt: new Date(now.getTime() + deps.config.overflowLeaseMs),
    });
    await dispatchToInner(deps, inner, leased);
  };

  // Each report covers one outage: a new one is reported after the agent checks in again.
  let reportedOutage = false;

  return {
    ...inner,
    async enqueueRender(job) {
      await overflowNow([job.renderId]);
    },
    async enqueueTryonProcessing(job) {
      const preview = await deps.repos.findTryonPreview(job.userId, job.listingVariantId);
      if (preview) await overflowNow([preview.id]);
    },
    async sweep(now = new Date()) {
      await reclaimExpiredLeases(deps, now);
      const lastHeartbeatAt = await deps.repos.latestAgentHeartbeat();
      const mode = overflowMode(deps.config, { now, lastHeartbeatAt });
      let overflowed = 0;
      if (mode !== "none") {
        const leased = await deps.repos.leaseAgentJobs({
          owner: OVERFLOW_OWNER,
          max: OVERFLOW_BATCH,
          now,
          leaseExpiresAt: new Date(now.getTime() + deps.config.overflowLeaseMs),
          queuedBefore: mode === "waited" ? new Date(now.getTime() - deps.config.overflowAfterMs) : undefined,
        });
        await dispatchToInner(deps, inner, leased);
        overflowed = leased.length;
      }

      // An agent that should be working but has been silent while jobs wait.
      const silent =
        inAgentWindow(now, deps.config.window, deps.config.timeZone) &&
        (lastHeartbeatAt === null || now.getTime() - lastHeartbeatAt.getTime() > deps.config.alertAfterMs);
      let agentDown = false;
      if (silent) {
        const queued = await deps.repos.countWaitingAgentJobs();
        agentDown = queued > 0;
        if (agentDown && !reportedOutage) {
          reportedOutage = true;
          deps.onAgentDown?.({ queued, lastHeartbeatAt });
        }
      } else {
        reportedOutage = false;
      }
      return { overflowed, agentDown };
    },
  };
}
