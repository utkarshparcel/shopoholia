import {
  FREE_RENDER_SCENARIOS,
  PAYWALLED_RENDER_SCENARIOS,
  type RenderProvider,
} from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";
import { pushCopyForState, type PushService } from "../push/stub.js";
import { isValidTransition } from "../orders/state-machine.js";

export async function seedOrderRenders(repos: Repositories, orderId: string) {
  const existing = await repos.findRendersByOrderId(orderId);
  if (existing.length > 0) return existing;

  const items = await repos.listOrderItemsByOrderId(orderId);
  const rows = items.flatMap((item) => [
    ...FREE_RENDER_SCENARIOS.map((scenario) => ({
      orderItemId: item.id,
      scenario,
      imageKey: null,
      isFree: true,
      unlocked: true,
      provider: "",
      status: "QUEUED" as const,
      costMicros: 0,
    })),
    ...PAYWALLED_RENDER_SCENARIOS.map((scenario) => ({
      orderItemId: item.id,
      scenario,
      imageKey: null,
      isFree: false,
      unlocked: false,
      provider: "",
      status: "QUEUED" as const,
      costMicros: 0,
    })),
  ]);

  return repos.createRenders(rows);
}

export async function checkAndMarkRevealReady(deps: {
  repos: Repositories;
  push: PushService;
  orderId: string;
}) {
  const order = await deps.repos.findOrderById(deps.orderId);
  if (!order || order.state === "REVEAL_READY") return;
  if (order.state !== "DELIVERED") return;

  const renders = await deps.repos.findRendersByOrderId(deps.orderId);
  const freeRenders = renders.filter((r) => r.isFree);
  if (freeRenders.length === 0) return;
  if (!freeRenders.every((r) => r.status === "DONE")) return;

  if (!isValidTransition(order.state, "REVEAL_READY")) return;

  const revealReadyAt = new Date();
  const stateEta = {
    ...order.stateEta,
    REVEAL_READY: revealReadyAt.toISOString(),
  };

  const updated = await deps.repos.updateOrderState(deps.orderId, "REVEAL_READY", {
    revealReadyAt,
    stateEta,
  });
  if (!updated) return;

  const copy = pushCopyForState("REVEAL_READY");
  await deps.push.send({
    userId: updated.userId,
    orderId: updated.id,
    eventType: "ORDER_REVEAL_READY",
    title: copy.title,
    body: copy.body,
  });
}

export async function processRenderJob(
  deps: {
    repos: Repositories;
    storage: StorageClient;
    renderProvider: RenderProvider;
    push: PushService;
  },
  renderId: string,
  orderId: string,
) {
  const render = await deps.repos.findRenderById(renderId);
  if (!render || render.status === "DONE") return;

  const item = await deps.repos.findOrderItemById(render.orderItemId);
  if (!item || item.orderId !== orderId) return;

  const order = await deps.repos.findOrderById(orderId);
  if (!order) return;

  const variant = await deps.repos.findVariantById(item.listingVariantId);
  if (!variant) return;

  const avatar = await deps.repos.findAvatarByUserId(order.userId);
  const modelImageKey = avatar?.referenceImageKey ?? "references/house-model.jpg";

  await deps.repos.updateRender(renderId, { status: "RUNNING" });

  try {
    const tryOn = await deps.renderProvider.tryOn({
      modelImageKey,
      garmentImageKey: variant.garmentImageKey,
    });

    await deps.storage.put({
      key: tryOn.imageKey,
      body: Buffer.from(`mock-tryon:${render.scenario}`),
      contentType: "image/jpeg",
    });

    const styled = await deps.renderProvider.scenarioPass({
      tryOnImageKey: tryOn.imageKey,
      scenario: render.scenario,
    });

    await deps.storage.put({
      key: styled.imageKey,
      body: Buffer.from(`mock-reveal:${render.scenario}`),
      contentType: "image/jpeg",
    });

    const costMicros = tryOn.costMicros + styled.costMicros;
    await deps.repos.updateRender(renderId, {
      status: "DONE",
      imageKey: styled.imageKey,
      provider: deps.renderProvider.name,
      costMicros,
    });

    if (render.isFree) {
      await checkAndMarkRevealReady({ repos: deps.repos, push: deps.push, orderId });
    }
  } catch {
    await deps.repos.updateRender(renderId, { status: "FAILED" });
  }
}

export async function enqueueFreeRendersForOrder(
  repos: Repositories,
  orderId: string,
  enqueue: (renderId: string, orderId: string) => Promise<void>,
) {
  const renders = await seedOrderRenders(repos, orderId);
  const freeQueued = renders.filter((r) => r.isFree && r.status === "QUEUED");
  for (const render of freeQueued) {
    await enqueue(render.id, orderId);
  }
}
