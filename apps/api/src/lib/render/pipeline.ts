import {
  FREE_RENDER_SCENARIOS,
  PAYWALLED_RENDER_SCENARIOS,
  REVEAL_COMBINE_COST_COINS,
  REVEAL_GENERATE_COST_COINS,
  REVEAL_UNLOCK_COST_COINS,
  type RenderProvider,
} from "@worn/shared";
import type { OrderRecord, RenderRecord, Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";
import { pushCopyForState, type PushService } from "../push/stub.js";
import { isValidTransition } from "../orders/state-machine.js";
import { FashnApiError } from "./fashn-client.js";
import { RenderUnavailableError } from "./provider.js";

/** `provider` of a render bought with POST /orders/:id/reveal/generate, until it is done. */
export const USER_GENERATED_PROVIDER = "user-generated";

/** Waits before the 2nd and 3rd attempt of a render that failed for a passing reason. */
export const RENDER_RETRY_DELAYS_MS: readonly number[] = [5_000, 30_000];

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
  // An order with no items has nothing to render, and Postgres rejects an empty insert.
  if (rows.length === 0) return [];

  return repos.createRenders(rows);
}

/**
 * Opens the reveal once every free render has finished, DONE or FAILED: a failed look shows as
 * failed (with a retry) in the reveal, rather than keeping the whole order DELIVERED forever.
 */
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
  if (!freeRenders.every((r) => r.status === "DONE" || r.status === "FAILED")) return;

  if (!isValidTransition(order.state, "REVEAL_READY")) return;

  const revealReadyAt = new Date();
  const stateEta = {
    ...order.stateEta,
    REVEAL_READY: revealReadyAt.toISOString(),
  };

  // Free renders finishing together each get here; only the first one moves the order on.
  const updated = await deps.repos.updateOrderState(
    deps.orderId,
    "REVEAL_READY",
    { revealReadyAt, stateEta },
    { from: "DELIVERED" },
  );
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

const LEGACY_COMBINED_MARKER = "combined:";

/**
 * The items a combined render dresses together, or null for one item's render. Renders made
 * before `combinedItemIds` existed kept them in `provider` as `combined:<id>,<id>` until done.
 */
export function combinedItemIds(render: Pick<RenderRecord, "combinedItemIds" | "provider">): string[] | null {
  if (render.combinedItemIds && render.combinedItemIds.length > 0) return render.combinedItemIds;
  if (render.provider.startsWith(LEGACY_COMBINED_MARKER)) {
    const ids = render.provider.slice(LEGACY_COMBINED_MARKER.length).split(",").filter(Boolean);
    return ids.length > 0 ? ids : null;
  }
  return null;
}

/**
 * The coins the user paid for this render, which a failed render gives back: a combine or a
 * generate (bought with POST …/reveal/generate) or an unlock. Free and locked renders cost nothing.
 */
export function paidCoinsForRender(
  render: Pick<RenderRecord, "isFree" | "unlocked" | "combinedItemIds" | "provider">,
): number {
  if (render.isFree || !render.unlocked) return 0;
  if (combinedItemIds(render)) return REVEAL_COMBINE_COST_COINS;
  if (render.provider === USER_GENERATED_PROVIDER) return REVEAL_GENERATE_COST_COINS;
  return REVEAL_UNLOCK_COST_COINS;
}

/** A render that can't succeed as asked (missing garment or model image): retrying won't help. */
export class RenderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderInputError";
  }
}

/** A render that ended FAILED after its attempts; `cause` is the last attempt's error. */
export class RenderFailedError extends Error {
  constructor(
    readonly renderId: string,
    readonly coinsRefunded: number,
    options: { cause: unknown },
  ) {
    super(`Render ${renderId} failed${coinsRefunded > 0 ? ` (refunded ${coinsRefunded} coins)` : ""}`, options);
    this.name = "RenderFailedError";
  }
}

/**
 * Whether another attempt might succeed: timeouts, network errors, FASHN 408/429/5xx and failed
 * predictions do; a missing provider, bad input or another FASHN 4xx don't.
 */
export function isTransientRenderError(error: unknown): boolean {
  if (error instanceof RenderUnavailableError || error instanceof RenderInputError) return false;
  if (error instanceof FashnApiError && error.status !== undefined) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return true;
}

export type RenderJobDeps = {
  repos: Repositories;
  storage: StorageClient;
  renderProvider: RenderProvider;
  push: PushService;
  /** Defaults to RENDER_RETRY_DELAYS_MS; its length is the number of retries. */
  retryDelaysMs?: readonly number[];
};

async function storeImage(storage: StorageClient, key: string, bytes: Uint8Array | undefined) {
  if (!bytes) return;
  await storage.put({ key, body: Buffer.from(bytes), contentType: "image/jpeg" });
}

/**
 * The photo the garments go on: the user's avatar, or for a user without one the first item's
 * house-model photo from the catalog (a real image, unlike a fixed placeholder key).
 */
async function modelImageFor(deps: RenderJobDeps, order: OrderRecord, firstVariantListingId: string) {
  const avatar = await deps.repos.findAvatarByUserId(order.userId);
  if (avatar?.status === "READY" && avatar.referenceImageKey) return avatar.referenceImageKey;
  const listing = await deps.repos.findListingById(firstVariantListingId);
  if (listing?.houseModelRenderKey) return listing.houseModelRenderKey;
  throw new RenderInputError("No avatar or house-model photo to render on");
}

/** One attempt: dresses every item in turn, then the scene. Returns the final image's key. */
async function renderOnce(deps: RenderJobDeps, render: RenderRecord, orderId: string, order: OrderRecord) {
  const itemIds = combinedItemIds(render) ?? [render.orderItemId];
  const garments: Array<{ listingId: string; garmentImageKey: string }> = [];
  for (const orderItemId of itemIds) {
    const orderItem = await deps.repos.findOrderItemById(orderItemId);
    if (!orderItem || orderItem.orderId !== orderId) continue;
    const variant = await deps.repos.findVariantById(orderItem.listingVariantId);
    if (variant) garments.push({ listingId: variant.listingId, garmentImageKey: variant.garmentImageKey });
  }
  if (garments.length === 0) throw new RenderInputError("No garment to render");

  let currentModelKey = await modelImageFor(deps, order, garments[0]!.listingId);
  let costMicros = 0;
  for (const garment of garments) {
    const tryOn = await deps.renderProvider.tryOn({
      modelImageKey: currentModelKey,
      garmentImageKey: garment.garmentImageKey,
    });
    await storeImage(deps.storage, tryOn.imageKey, tryOn.imageBytes);
    currentModelKey = tryOn.imageKey;
    costMicros += tryOn.costMicros;
  }

  const styled = await deps.renderProvider.scenarioPass({
    tryOnImageKey: currentModelKey,
    scenario: render.scenario,
  });
  await storeImage(deps.storage, styled.imageKey, styled.imageBytes);
  return { imageKey: styled.imageKey, costMicros: costMicros + styled.costMicros };
}

/**
 * Renders one look, retrying passing failures a few times. A render that still fails ends
 * FAILED, gives back the coins paid for it (once, however often this runs), and throws
 * RenderFailedError so the job queue reports it. Either way a free render may open the reveal.
 */
export async function processRenderJob(deps: RenderJobDeps, renderId: string, orderId: string) {
  const render = await deps.repos.findRenderById(renderId);
  // DONE, or FAILED (and refunded): only a retry, which queues it again, renders it once more.
  if (!render || (render.status !== "QUEUED" && render.status !== "RUNNING")) return;
  // A locked render is waiting to be paid for, not to be rendered.
  if (!render.isFree && !render.unlocked) return;

  const item = await deps.repos.findOrderItemById(render.orderItemId);
  if (!item || item.orderId !== orderId) return;

  const order = await deps.repos.findOrderById(orderId);
  if (!order) return;

  await deps.repos.updateRender(renderId, { status: "RUNNING" });

  const retryDelaysMs = deps.retryDelaysMs ?? RENDER_RETRY_DELAYS_MS;
  let result: { imageKey: string; costMicros: number } | null = null;
  let lastError: unknown;
  for (let attempt = 0; ; attempt += 1) {
    try {
      result = await renderOnce(deps, render, orderId, order);
      break;
    } catch (error) {
      lastError = error;
      const delay = retryDelaysMs[attempt];
      if (delay === undefined || !isTransientRenderError(error)) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (result) {
    await deps.repos.updateRender(renderId, {
      status: "DONE",
      imageKey: result.imageKey,
      provider: deps.renderProvider.name,
      costMicros: result.costMicros,
    });
  } else {
    const coins = paidCoinsForRender(render);
    await deps.repos.failRender({
      renderId,
      refund: coins > 0 ? { userId: order.userId, coins } : null,
    });
  }

  if (render.isFree) {
    await checkAndMarkRevealReady({ repos: deps.repos, push: deps.push, orderId });
  }

  if (!result) {
    throw new RenderFailedError(renderId, paidCoinsForRender(render), { cause: lastError });
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
