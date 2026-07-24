import { describe, expect, it } from "vitest";
import {
  FREE_RENDER_SCENARIOS,
  PAYWALLED_RENDER_SCENARIOS,
} from "@worn/shared";
import { createMemoryRepositories } from "../repositories/memory.js";
import { createMockRenderProvider } from "./provider.js";
import { createMockStorage } from "../storage/r2.js";
import { createStubPushService } from "../push/stub.js";
import {
  checkAndMarkRevealReady,
  processRenderJob,
  seedOrderRenders,
} from "./pipeline.js";

describe("render pipeline", () => {
  it("seeds free and paywalled render rows per order item", async () => {
    const repos = createMemoryRepositories();
    const { order, items } = await repos.createOrder({
      userId: "user-1",
      tier: "EXPRESS",
      coinTotal: 50,
      stateEta: {},
      items: [{ listingVariantId: "variant-1", coinPriceSnapshot: 50, quantity: 1 }],
    });

    const renders = await seedOrderRenders(repos, order.id);
    expect(renders).toHaveLength(
      FREE_RENDER_SCENARIOS.length + PAYWALLED_RENDER_SCENARIOS.length,
    );
    expect(renders.filter((r) => r.isFree)).toHaveLength(FREE_RENDER_SCENARIOS.length);
    expect(renders.filter((r) => !r.isFree)).toHaveLength(PAYWALLED_RENDER_SCENARIOS.length);
    expect(items).toHaveLength(1);
  });

  it("processes free renders and marks REVEAL_READY", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919111111111");
    await repos.upsertAvatar({
      userId: user.id,
      referenceImageKey: "references/test.jpg",
      sourceUploadKeys: [],
      bodyMeta: {},
      status: "READY",
    });
    await repos.seedListings(
      [
        {
          id: "listing-1",
          sellerId: null,
          title: "Test",
          category: "tops",
          tags: [],
          coinPrice: 50,
          productImageKeys: [],
          houseModelRenderKey: "house/1.jpg",
          status: "ACTIVE",
          sortOrder: 0,
          createdAt: new Date(),
        },
      ],
      [
        {
          id: "variant-1",
          listingId: "listing-1",
          size: "M",
          color: "Black",
          garmentImageKey: "garments/1.jpg",
        },
      ],
    );

    const { order } = await repos.createOrder({
      userId: user.id,
      tier: "EXPRESS",
      coinTotal: 50,
      stateEta: {},
      items: [{ listingVariantId: "variant-1", coinPriceSnapshot: 50, quantity: 1 }],
    });
    await repos.updateOrderState(order.id, "DELIVERED");

    const push = createStubPushService(repos);
    const storage = createMockStorage();
    const renderProvider = createMockRenderProvider();
    const seeded = await seedOrderRenders(repos, order.id);

    for (const render of seeded.filter((r) => r.isFree)) {
      await processRenderJob(
        { repos, storage, renderProvider, push },
        render.id,
        order.id,
      );
    }

    const updated = await repos.findOrderById(order.id);
    expect(updated?.state).toBe("REVEAL_READY");
    expect(updated?.revealReadyAt).toBeTruthy();

    const doneRenders = await repos.findRendersByOrderId(order.id);
    const freeDone = doneRenders.filter((r) => r.isFree && r.status === "DONE");
    expect(freeDone).toHaveLength(FREE_RENDER_SCENARIOS.length);
    expect(freeDone.every((r) => r.costMicros > 0)).toBe(true);
  });

  it("does not mark reveal ready until all free renders complete", async () => {
    const repos = createMemoryRepositories();
    const { order } = await repos.createOrder({
      userId: "user-2",
      tier: "EXPRESS",
      coinTotal: 50,
      stateEta: {},
      items: [{ listingVariantId: "variant-1", coinPriceSnapshot: 50, quantity: 1 }],
    });
    await repos.updateOrderState(order.id, "DELIVERED");
    await seedOrderRenders(repos, order.id);

    const push = createStubPushService(repos);
    await checkAndMarkRevealReady({ repos, push, orderId: order.id });

    const updated = await repos.findOrderById(order.id);
    expect(updated?.state).toBe("DELIVERED");
  });
});
