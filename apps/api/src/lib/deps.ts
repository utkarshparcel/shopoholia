import type { RenderProvider } from "@worn/shared";
import type { Repositories } from "./repositories/types.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import { createPostgresRepositoriesFromUrl } from "./repositories/postgres.js";
import { createStorageFromEnv, type StorageClient } from "./storage/r2.js";
import { createRenderProvider } from "./render/provider.js";
import { createDevOtpService, type OtpService } from "./auth/otp.js";
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
import { createStubPushService, type PushService } from "./push/stub.js";
import { seedCatalog } from "./seed/catalog.js";

export type AppDeps = {
  repos: Repositories;
  storage: StorageClient;
  renderProvider: RenderProvider;
  jobQueue: JobQueue;
  otp: OtpService;
  push: PushService;
};

function createRepositories(): Repositories {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return createPostgresRepositoriesFromUrl(databaseUrl);
  }
  return createMemoryRepositories();
}

async function maybeSeedCatalog(repos: Repositories, storage: StorageClient) {
  const page = await repos.listListings({ limit: 1 });
  if (page.items.length === 0) {
    await seedCatalog(repos, storage);
  }
}

export async function createDefaultDeps(overrides: Partial<AppDeps> = {}): Promise<AppDeps> {
  const repos = overrides.repos ?? createRepositories();
  const storage = overrides.storage ?? createStorageFromEnv();
  const renderProvider =
    overrides.renderProvider ??
    createRenderProvider({
      apiKey: process.env.FASHN_API_KEY,
      resolveImage: (key) => storage.getSignedUrl(key),
    });
  const push = overrides.push ?? createStubPushService(repos);
  const avatarHandler = createAvatarProcessingHandler({ repos, storage, renderProvider });
  const tryonHandler = createTryonProcessingHandler({ repos, storage, renderProvider });
  const renderHandler = createRenderProcessingHandler({ repos, storage, renderProvider, push });

  if (overrides.jobQueue) {
    const otp = overrides.otp ?? createDevOtpService(repos);
    if (!overrides.repos) {
      await maybeSeedCatalog(repos, storage);
    }
    return {
      repos,
      storage,
      renderProvider,
      jobQueue: overrides.jobQueue,
      otp,
      push,
    };
  }

  const jobQueue = createMemoryJobQueue(
    {
      avatar: avatarHandler,
      tryon: tryonHandler,
      orderTransition: createOrderTransitionHandler({
        repos,
        push,
        onDelivered: async (orderId) => {
          await jobQueue.enqueueDeliveredRender({ orderId });
        },
      }),
      deliveredRender: createDeliveredRenderHandler({
        repos,
        enqueueRender: async (job) => jobQueue.enqueueRender(job),
      }),
      render: renderHandler,
    },
    { autoProcess: process.env.NODE_ENV !== "test", repos },
  );

  const otp = overrides.otp ?? createDevOtpService(repos);

  if (!overrides.repos) {
    await maybeSeedCatalog(repos, storage);
  }

  return { repos, storage, renderProvider, jobQueue, otp, push };
}

export { newJobId };
