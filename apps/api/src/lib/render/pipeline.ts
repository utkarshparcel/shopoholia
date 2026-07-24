import {
  FREE_RENDER_SCENARIOS,
  PAYWALLED_RENDER_SCENARIOS,
  type RenderProvider,
} from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";
import { pushCopyForState, type PushService } from "../push/stub.js";
import { isValidTransition } from "../orders/state-machine.js";
import { downloadImage } from "./download.js";

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

  const avatar = await deps.repos.findAvatarByUserId(order.userId);
  const modelImageKey = avatar?.referenceImageKey ?? "references/house-model.jpg";

  await deps.repos.updateRender(renderId, { status: "RUNNING" });

  try {
    const isCombined = render.provider.startsWith("combined:");
    let finalImageKey: string;
    let costMicros = 0;

    if (isCombined) {
      const itemIds = render.provider.slice("combined:".length).split(",");
      let currentModelKey = modelImageKey;

      for (const orderItemId of itemIds) {
        const orderItem = await deps.repos.findOrderItemById(orderItemId);
        if (!orderItem) continue;

        const variant = await deps.repos.findVariantById(orderItem.listingVariantId);
        if (!variant) continue;

    const tryOn = await deps.renderProvider.tryOn({
      modelImageKey: currentModelKey,
      garmentImageKey: variant.garmentImageKey,
    });

    if (tryOn.imageBytes) {
      await deps.storage.put({
        key: tryOn.imageKey,
        body: Buffer.from(tryOn.imageBytes),
        contentType: "image/jpeg",
      });
    }

    currentModelKey = tryOn.imageKey;
    costMicros += tryOn.costMicros;
      }

      const styled = await deps.renderProvider.scenarioPass({
        tryOnImageKey: currentModelKey,
        scenario: render.scenario,
      });

      if (styled.imageBytes) {
        await deps.storage.put({
          key: styled.imageKey,
          body: Buffer.from(styled.imageBytes),
          contentType: "image/jpeg",
        });
      }

      finalImageKey = styled.imageKey;
      costMicros += styled.costMicros;
    } else {
      const variant = await deps.repos.findVariantById(item.listingVariantId);
      if (!variant) {
        await deps.repos.updateRender(renderId, { status: "FAILED" });
        return;
      }

      const tryOn = await deps.renderProvider.tryOn({
        modelImageKey,
        garmentImageKey: variant.garmentImageKey,
      });

      if (tryOn.imageBytes) {
        await deps.storage.put({
          key: tryOn.imageKey,
          body: Buffer.from(tryOn.imageBytes),
          contentType: "image/jpeg",
        });
      }

      const styled = await deps.renderProvider.scenarioPass({
        tryOnImageKey: tryOn.imageKey,
        scenario: render.scenario,
      });

      if (styled.imageBytes) {
        await deps.storage.put({
          key: styled.imageKey,
          body: Buffer.from(styled.imageBytes),
          contentType: "image/jpeg",
        });
      }

      finalImageKey = styled.imageKey;
      costMicros = tryOn.costMicros + styled.costMicros;
    }

    await deps.repos.updateRender(renderId, {
      status: "DONE",
      imageKey: finalImageKey,
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
