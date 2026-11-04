import type { RenderProvider } from "@worn/shared";
import type { Repositories } from "./repositories/types.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import { createPostgresRepositoriesFromUrl } from "./repositories/postgres.js";
import { createStorageFromEnv, type StorageClient } from "./storage/r2.js";
import { createOcrClientFromEnv, type OcrClient } from "./ocr/index.js";
import { createRenderProvider } from "./render/provider.js";
import { resolveRenderConfig, type RenderConfig } from "./render/backend.js";
import { createAgentJobQueue, type AgentJobQueue } from "./render/agent-jobs.js";
import { captureException } from "./sentry.js";
import { createDevOtpService, type OtpService } from "./auth/otp.js";
import { createPurchaseVerifier, type PurchaseVerifier } from "./coin-purchases.js";
import { storeConnectionsFromEnv, type StoreConnections } from "./iap/stores.js";
import { reportJobError } from "./error-reporting.js";
import {
  createAvatarProcessingHandler,
  newJobId,
} from "./jobs/avatar-processing.js";
import { createTryonProcessingHandler } from "./jobs/tryon-processing.js";
import { createOrderTransitionHandler } from "./jobs/order-processing.js";
import {
  createDeliveredRenderHandler,
  createRenderProcessingHandler,
} from "./jobs/render-processing.js";
import { createMemoryJobQueue, type JobQueue } from "./jobs/queue.js";
import { createExpoPushService } from "./push/expo.js";
import type { PushService } from "./push/stub.js";
import { seedCatalog } from "./seed/catalog.js";
import { isRealProductImageUrl, seedScrapedCatalog } from "./seed/scraped.js";

export type AppDeps = {
  repos: Repositories;
  storage: StorageClient;
  ocr: OcrClient;
  renderProvider: RenderProvider;
  jobQueue: JobQueue;
  otp: OtpService;
  push: PushService;
  purchaseVerifier: PurchaseVerifier;
  /** App Store / Google Play configuration (null for a store that isn't set up). */
  storeConnections: StoreConnections;
  /** RENDER_BACKEND and the render agent's window, overflow and token. */
  renderConfig: RenderConfig;
};

/** The agent job queue's sweep, when RENDER_BACKEND=agent (the server runs it on a timer). */
export function agentSweep(jobQueue: JobQueue): AgentJobQueue["sweep"] | null {
  const sweep = (jobQueue as Partial<AgentJobQueue>).sweep;
  return typeof sweep === "function" ? sweep.bind(jobQueue) : null;
}

function createRepositories(): Repositories {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return createPostgresRepositoriesFromUrl(databaseUrl);
  }
  return createMemoryRepositories();
}

function catalogNeedsRealImages(items: { houseModelRenderKey: string }[]): boolean {
  if (items.length === 0) return true;
  if (items.some((item) => /picsum\.photos/i.test(item.houseModelRenderKey))) {
    return true;
  }
  return items.every(
    (item) =>
      item.houseModelRenderKey.startsWith("house-models/") ||
      !isRealProductImageUrl(item.houseModelRenderKey),
  );
}

/**
 * Boot-time catalog seeding. Production only ever fills an empty catalog, from the scraped catalog
 * file (bundled in dist, or CATALOG_SEED_FILE): it never clears listings and never seeds synthetic
 * fixtures. Outside production a placeholder catalog is replaced with the scraped one.
 */
export async function maybeSeedCatalog(
  repos: Repositories,
  storage: StorageClient,
  env: Record<string, string | undefined> = process.env,
) {
  const page = await repos.listListings({ limit: 50 });
  if (env.NODE_ENV === "production") {
    if (page.items.length > 0) return;
    const seeded = await seedScrapedCatalog(repos, { limit: 10_000, env });
    if (!seeded) {
      console.warn("[catalog] the catalog is empty and no catalog file was found: nothing seeded");
    }
    return;
  }
  if (!catalogNeedsRealImages(page.items)) return;

  if (page.items.length > 0) {
    await repos.clearCatalog();
  }
  // Always prefer scraped product images when (re)seeding.
  await seedCatalog(repos, storage, 10_000, { preferScraped: true });
}

export async function createDefaultDeps(overrides: Partial<AppDeps> = {}): Promise<AppDeps> {
  const repos = overrides.repos ?? createRepositories();
  const renderConfig = overrides.renderConfig ?? resolveRenderConfig();
  const storage = overrides.storage ?? createStorageFromEnv();
  const ocr =
    overrides.ocr ??
    createOcrClientFromEnv(process.env, { resolveImageUrl: (key) => storage.getSignedUrl(key) });
  const renderProvider =
    overrides.renderProvider ??
    createRenderProvider({
      apiKey: process.env.FASHN_API_KEY,
      resolveImage: (key) => storage.getSignedUrl(key),
    });
  const push =
    overrides.push ??
    createExpoPushService({ repos, accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });
  const avatarHandler = createAvatarProcessingHandler({ repos, storage, renderProvider });
  const tryonHandler = createTryonProcessingHandler({ repos, storage, renderProvider });
  const renderHandler = createRenderProcessingHandler({ repos, storage, renderProvider, push });
  const storeConnections = overrides.storeConnections ?? storeConnectionsFromEnv();
  const purchaseVerifier = overrides.purchaseVerifier ?? createPurchaseVerifier(storeConnections);

  if (overrides.jobQueue) {
    const otp = overrides.otp ?? createDevOtpService(repos);
    if (!overrides.repos) {
      await maybeSeedCatalog(repos, storage);
    }
    return {
      repos,
      storage,
      ocr,
      renderProvider,
      jobQueue: overrides.jobQueue,
      otp,
      push,
      purchaseVerifier,
      storeConnections,
      renderConfig,
    };
  }

  const inProcessQueue: JobQueue = createMemoryJobQueue(
    {
      avatar: avatarHandler,
      tryon: tryonHandler,
      orderTransition: createOrderTransitionHandler({
        repos,
        push,
        onDelivered: async (orderId) => {
          await inProcessQueue.enqueueDeliveredRender({ orderId });
        },
      }),
      deliveredRender: createDeliveredRenderHandler({
        repos,
        enqueueRender: async (job) => jobQueue.enqueueRender(job),
      }),
      render: renderHandler,
    },
    { autoProcess: process.env.NODE_ENV !== "test", repos, onError: reportJobError },
  );
  // RENDER_BACKEND=agent: renders and try-ons wait in the database for the render agent; the
  // in-process queue runs them only as FASHN overflow.
  const jobQueue: JobQueue =
    renderConfig.backend === "agent"
      ? createAgentJobQueue(inProcessQueue, {
          repos,
          storage,
          push,
          config: renderConfig,
          onAgentDown: ({ queued, lastHeartbeatAt }) => {
            const since = lastHeartbeatAt ? lastHeartbeatAt.toISOString() : "never";
            const error = new Error(`Render agent silent (last heartbeat ${since}) with ${queued} render jobs waiting`);
            console.error(`[render-agent] ${error.message}`);
            captureException(error, { tags: { area: "render-agent" } });
          },
        })
      : inProcessQueue;

  const otp = overrides.otp ?? createDevOtpService(repos);

  if (!overrides.repos) {
    await maybeSeedCatalog(repos, storage);
  }

  return {
    repos,
    storage,
    ocr,
    renderProvider,
    jobQueue,
    otp,
    push,
    purchaseVerifier,
    storeConnections,
    renderConfig,
  };
}

export { newJobId };
