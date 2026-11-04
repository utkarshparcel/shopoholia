import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { REVEAL_COMBINE_COST_COINS, REVEAL_UNLOCK_COST_COINS, type RenderProvider } from "@worn/shared";
import { createStubPushService } from "../push/stub.js";
import { createMemoryRepositories } from "../repositories/memory.js";
import { createPostgresRepositoriesFromUrl } from "../repositories/postgres.js";
import type { Repositories } from "../repositories/types.js";
import { createMockStorage, type StorageClient } from "../storage/r2.js";
import { FashnApiError } from "./fashn-client.js";
import { RenderFailedError, processRenderJob, seedOrderRenders } from "./pipeline.js";
import { createFashnRenderProvider, createMockRenderProvider, RenderUnavailableError } from "./provider.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

/** Storage that keeps what is written, to check the bytes a render left behind. */
function recordingStorage(): StorageClient & { stored: Map<string, Buffer> } {
  const stored = new Map<string, Buffer>();
  return {
    ...createMockStorage(),
    stored,
    async put(o) {
      stored.set(o.key, Buffer.from(o.body as Buffer));
      return { key: o.key };
    },
    async getSignedUrl(key) {
      return `https://media.worncloset.app/${key}`;
    },
  };
}

/** A delivered order of `itemCount` catalog lines, for a user with coins and (optionally) an avatar. */
async function deliveredOrder(
  repos: Repositories,
  { itemCount = 1, avatarKey, garmentImageKey }: { itemCount?: number; avatarKey?: string; garmentImageKey?: string } = {},
) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  await repos.grantCoins({ userId: user.id, delta: 500, type: "GRANT" });
  if (avatarKey) {
    await repos.upsertAvatar({
      userId: user.id,
      referenceImageKey: avatarKey,
      sourceUploadKeys: [],
      bodyMeta: {},
      status: "READY",
    });
  }
  const listingId = randomUUID();
  const variantIds = Array.from({ length: itemCount }, () => randomUUID());
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Render failure test",
        category: "TOPS",
        tags: [],
        coinPrice: 50,
        realPrice: null,
        productImageKeys: [],
        houseModelRenderKey: `house-models/${listingId}.jpg`,
        affiliateUrl: null,
        affiliateLinks: null,
        status: "DRAFT",
        sortOrder: 0,
        createdAt: new Date(),
      },
    ],
    variantIds.map((id) => ({
      id,
      listingId,
      size: "M",
      color: "Black",
      garmentImageKey: garmentImageKey ?? `garments/${id}.jpg`,
    })),
  );
  const { order, items } = await repos.createOrder({
    userId: user.id,
    tier: "EXPRESS",
    coinTotal: 0,
    stateEta: {},
    items: variantIds.map((listingVariantId) => ({ listingVariantId, coinPriceSnapshot: 50, quantity: 1 })),
  });
  await repos.updateOrderState(order.id, "DELIVERED");
  const renders = await seedOrderRenders(repos, order.id);
  return { user, order, items, renders };
}

function failingProvider(errors: unknown[]): RenderProvider & { tryOn: ReturnType<typeof vi.fn> } {
  const mock = createMockRenderProvider();
  const tryOn = vi.fn(async (input: Parameters<RenderProvider["tryOn"]>[0]) => {
    if (errors.length > 0) throw errors.shift();
    return mock.tryOn(input);
  });
  return { ...mock, tryOn };
}

function deps(repos: Repositories, renderProvider: RenderProvider, storage: StorageClient = createMockStorage()) {
  return { repos, storage, renderProvider, push: createStubPushService(repos), retryDelaysMs: [0, 0] };
}

describe("reveal render with the live FASHN provider", () => {
  it("stores the real try-on image as the scene, with the catalog URL sent as it is", async () => {
    const repos = createMemoryRepositories();
    const { order, renders } = await deliveredOrder(repos, {
      avatarKey: "uploads/u1/selfie.jpg",
      garmentImageKey: "https://assets.newme.asia/x.webp",
    });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
    const runBodies: Array<{ inputs: Record<string, string> }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/run")) {
        runBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: "pred-9" }), { status: 200 });
      }
      if (href.includes("/status/")) {
        return new Response(
          JSON.stringify({ status: "completed", output: ["https://cdn.fashn.ai/pred-9/output_0.jpg"] }),
          { status: 200 },
        );
      }
      return new Response(jpeg, { status: 200 });
    }) as unknown as typeof fetch;
    const storage = recordingStorage();
    const provider = createFashnRenderProvider("live-key", {
      resolveImage: (key) => storage.getSignedUrl(key),
      fetchImpl,
    });
    const studio = renders.find((r) => r.isFree && r.scenario === "STUDIO")!;

    await processRenderJob(deps(repos, provider, storage), studio.id, order.id);

    const done = await repos.findRenderById(studio.id);
    expect(done).toMatchObject({ status: "DONE", provider: "fashn", imageKey: "tryon/fashn/pred-9.jpg" });
    expect(storage.stored.get(done!.imageKey!)).toEqual(Buffer.from(jpeg));
    expect([...storage.stored.values()].map(String).join()).not.toMatch(/mock-/);
    expect(runBodies[0]!.inputs).toMatchObject({
      model_image: "https://media.worncloset.app/uploads/u1/selfie.jpg",
      product_image: "https://assets.newme.asia/x.webp",
    });
  });
});

describe("combined render with the live FASHN provider", () => {
  it("keeps only the final image: the try-on steps before it are deleted", async () => {
    const repos = createMemoryRepositories();
    const { user, order, items } = await deliveredOrder(repos, {
      itemCount: 2,
      avatarKey: "uploads/u1/selfie.jpg",
      garmentImageKey: "https://assets.newme.asia/x.webp",
    });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7]);
    let prediction = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith("/run")) {
        prediction += 1;
        return new Response(JSON.stringify({ id: `pred-${prediction}` }), { status: 200 });
      }
      if (href.includes("/status/")) {
        const id = href.split("/status/")[1];
        return new Response(
          JSON.stringify({ status: "completed", output: [`https://cdn.fashn.ai/${id}/output_0.jpg`] }),
          { status: 200 },
        );
      }
      return new Response(jpeg, { status: 200 });
    }) as unknown as typeof fetch;
    const storage = recordingStorage();
    const deleted: string[] = [];
    storage.deleteMany = async (keys) => {
      deleted.push(...keys);
      for (const key of keys) storage.stored.delete(key);
    };
    const provider = createFashnRenderProvider("live-key", {
      resolveImage: (key) => storage.getSignedUrl(key),
      fetchImpl,
    });
    const combine = await repos.purchaseRender({
      userId: user.id,
      orderId: order.id,
      render: {
        orderItemId: items[0]!.id,
        scenario: "NIGHT",
        imageKey: null,
        isFree: false,
        unlocked: true,
        provider: "user-generated",
        combinedItemIds: items.map((i) => i.id),
        status: "QUEUED",
        costMicros: 0,
      },
      cost: REVEAL_COMBINE_COST_COINS,
      ledgerType: "SPEND_COMBINE",
    });
    if (combine.status !== "created") throw new Error(combine.status);

    await processRenderJob(deps(repos, provider, storage), combine.render.id, order.id);

    const done = await repos.findRenderById(combine.render.id);
    expect(done).toMatchObject({ status: "DONE", imageKey: "tryon/fashn/pred-2.jpg" });
    expect(deleted).toEqual(["tryon/fashn/pred-1.jpg"]);
    expect([...storage.stored.keys()]).toEqual(["tryon/fashn/pred-2.jpg"]);
  });
});

describe("render failures (memory)", () => {
  failureCases(() => createMemoryRepositories());
});

describePostgres("render failures (Postgres)", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  failureCases(() => repos);

  it("lists an order's renders in one stable order, also after they are updated", async () => {
    const { order, renders } = await deliveredOrder(repos, { itemCount: 3 });
    const before = (await repos.findRendersByOrderId(order.id)).map((r) => r.id);
    // Updates move rows around in the heap, which an order by created_at alone then shows.
    for (const render of [...renders].reverse()) {
      await repos.updateRender(render.id, { status: "RUNNING" });
      await repos.updateRender(render.id, { status: "DONE", imageKey: `k/${render.id}` });
    }
    const after = (await repos.findRendersByOrderId(order.id)).map((r) => r.id);
    expect(after).toEqual(before);
    // By item, then scenario in enum order, as the memory repository lists them.
    const byItem = (r: { orderItemId: string }) => r.orderItemId;
    const listed = after.map((id) => renders.find((r) => r.id === id)!);
    expect(listed.map(byItem)).toEqual(listed.map(byItem).sort());
    expect(listed.slice(0, 6).map((r) => r.scenario)).toEqual([
      "STUDIO",
      "GOLDEN_HOUR",
      "STREET",
      "EDITORIAL_DARK",
      "NIGHT",
      "CANDID",
    ]);
  });
});

function failureCases(getRepos: () => Repositories) {
  it("retries a passing failure and then renders", async () => {
    const repos = getRepos();
    const { order, renders } = await deliveredOrder(repos);
    const provider = failingProvider([
      new FashnApiError("FASHN /run failed (503)", null, 503),
      new Error("fetch failed"),
    ]);
    const studio = renders.find((r) => r.isFree && r.scenario === "STUDIO")!;

    await processRenderJob(deps(repos, provider), studio.id, order.id);

    expect(provider.tryOn).toHaveBeenCalledTimes(3);
    expect(await repos.findRenderById(studio.id)).toMatchObject({ status: "DONE" });
  });

  it("stops after the bounded retries, and doesn't retry a refusal that can't pass", async () => {
    const repos = getRepos();
    // One free scene per piece: two pieces give two free renders.
    const { order, renders } = await deliveredOrder(repos, { itemCount: 2 });
    const [studio, golden] = renders.filter((r) => r.isFree);
    const down = failingProvider(Array.from({ length: 10 }, () => new Error("timeout")));
    await expect(processRenderJob(deps(repos, down), studio!.id, order.id)).rejects.toBeInstanceOf(RenderFailedError);
    expect(down.tryOn).toHaveBeenCalledTimes(3);

    const refused = failingProvider([new FashnApiError("bad image", null, 400), new Error("unused")]);
    await expect(processRenderJob(deps(repos, refused), golden!.id, order.id)).rejects.toBeInstanceOf(
      RenderFailedError,
    );
    expect(refused.tryOn).toHaveBeenCalledTimes(1);
  });

  it("opens the reveal once every free render is done or failed", async () => {
    const repos = getRepos();
    const { order, renders } = await deliveredOrder(repos, { itemCount: 2 });
    const [studio, golden] = renders.filter((r) => r.isFree);
    await processRenderJob(deps(repos, createMockRenderProvider()), studio!.id, order.id);
    await expect(
      processRenderJob(deps(repos, failingProvider([new RenderUnavailableError()])), golden!.id, order.id),
    ).rejects.toThrow();

    expect(await repos.findRenderById(golden!.id)).toMatchObject({ status: "FAILED" });
    expect((await repos.findOrderById(order.id))?.state).toBe("REVEAL_READY");
  });

  it("refunds a failed unlocked render once, and a failed combine at its price", async () => {
    const repos = getRepos();
    const { user, order, items, renders } = await deliveredOrder(repos, { itemCount: 2 });
    const locked = renders.find((r) => !r.isFree)!;
    const unlocked = await repos.unlockOrderRenders({
      userId: user.id,
      orderId: order.id,
      renderIds: [locked.id],
      costPerRender: REVEAL_UNLOCK_COST_COINS,
    });
    expect(unlocked.status).toBe("unlocked");
    const combine = await repos.purchaseRender({
      userId: user.id,
      orderId: order.id,
      render: {
        orderItemId: items[0]!.id,
        scenario: "NIGHT",
        imageKey: null,
        isFree: false,
        unlocked: true,
        provider: "user-generated",
        combinedItemIds: items.map((i) => i.id),
        status: "QUEUED",
        costMicros: 0,
      },
      cost: REVEAL_COMBINE_COST_COINS,
      ledgerType: "SPEND_COMBINE",
    });
    if (combine.status !== "created") throw new Error(combine.status);
    const paid = await repos.getCoinBalance(user.id);
    const down = () => failingProvider(Array.from({ length: 10 }, () => new RenderUnavailableError()));

    await expect(processRenderJob(deps(repos, down()), locked.id, order.id)).rejects.toThrow(/refunded 50/);
    await expect(processRenderJob(deps(repos, down()), combine.render.id, order.id)).rejects.toThrow(/refunded 75/);
    expect(await repos.getCoinBalance(user.id)).toBe(paid + REVEAL_UNLOCK_COST_COINS + REVEAL_COMBINE_COST_COINS);

    // Run again (a duplicate job, a restart): nothing is rendered or refunded twice.
    await processRenderJob(deps(repos, down()), locked.id, order.id);
    const again = await repos.failRender({ renderId: locked.id, refund: { userId: user.id, coins: 50 } });
    expect(again.coinsRefunded).toBe(0);
    const twice = await Promise.all(
      [1, 2, 3].map(() => repos.failRender({ renderId: combine.render.id, refund: { userId: user.id, coins: 75 } })),
    );
    expect(twice.map((r) => r.coinsRefunded)).toEqual([0, 0, 0]);
    expect(await repos.getCoinBalance(user.id)).toBe(paid + REVEAL_UNLOCK_COST_COINS + REVEAL_COMBINE_COST_COINS);
    const { transactions } = await repos.listCoinTransactions({ userId: user.id, limit: 20 });
    expect(transactions.filter((t) => t.type === "REFUND").map((t) => t.delta).sort()).toEqual([50, 75]);
  });

  it("charges nothing back for a failed free render, and queues only failed free ones for a retry", async () => {
    const repos = getRepos();
    const { user, order, renders } = await deliveredOrder(repos);
    const before = await repos.getCoinBalance(user.id);
    const studio = renders.find((r) => r.isFree)!;
    const locked = renders.find((r) => !r.isFree)!;
    await expect(
      processRenderJob(deps(repos, failingProvider([new RenderUnavailableError()])), studio.id, order.id),
    ).rejects.toThrow();
    expect(await repos.getCoinBalance(user.id)).toBe(before);

    const other = await deliveredOrder(repos);
    expect(
      await repos.requeueFailedFreeRenders({ userId: other.user.id, orderId: order.id, renderIds: [studio.id] }),
    ).toEqual([]);
    const retried = await Promise.all(
      [1, 2].map(() =>
        repos.requeueFailedFreeRenders({ userId: user.id, orderId: order.id, renderIds: [studio.id, locked.id] }),
      ),
    );
    expect(retried.flat().map((r) => [r.id, r.status])).toEqual([[studio.id, "QUEUED"]]);
  });
}
