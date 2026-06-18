import type { RenderProvider } from "@worn/shared";
import type { Repositories } from "./repositories/types.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import { createMockStorage, type StorageClient } from "./storage/r2.js";
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

export async function createDefaultDeps(overrides: Partial<AppDeps> = {}): Promise<AppDeps> {
  const repos = overrides.repos ?? createMemoryRepositories();
  const storage = overrides.storage ?? createMockStorage();
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
      await seedCatalog(repos, storage);
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

  let jobQueue!: JobQueue;

  const deliveredRenderHandler = createDeliveredRenderHandler({
    repos,
    enqueueRender: async (job) => jobQueue.enqueueRender(job),
  });

  const orderTransitionHandler = createOrderTransitionHandler({
    repos,
    push,
    onDelivered: async (orderId) => {
      await jobQueue.enqueueDeliveredRender({ orderId });
    },
  });

  jobQueue = createMemoryJobQueue(
    {
      avatar: avatarHandler,
      tryon: tryonHandler,
      orderTransition: orderTransitionHandler,
      deliveredRender: deliveredRenderHandler,
      render: renderHandler,
    },
    { autoProcess: process.env.NODE_ENV !== "test", repos },
  );

  const otp = overrides.otp ?? createDevOtpService(repos);

  if (!overrides.repos) {
    await seedCatalog(repos, storage);
  }

  return { repos, storage, renderProvider, jobQueue, otp, push };
}

export { newJobId };
