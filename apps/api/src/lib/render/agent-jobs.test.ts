import { randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REVEAL_UNLOCK_COST_COINS } from "@worn/shared";
import type { PushService } from "../push/stub.js";
import type { JobQueue } from "../jobs/queue.js";
import { createMemoryRepositories } from "../repositories/memory.js";
import { createPostgresRepositoriesFromUrl } from "../repositories/postgres.js";
import type { Repositories } from "../repositories/types.js";
import { createMockStorage } from "../storage/r2.js";
import { resolveRenderConfig, type RenderConfig } from "./backend.js";
import {
  agentOutputKey,
  completeAgentJob,
  createAgentJobQueue,
  failAgentJob,
  leaseJobsForAgent,
  OVERFLOW_OWNER,
  overflowMode,
  renderWaitEstimate,
} from "./agent-jobs.js";
import { seedOrderRenders } from "./pipeline.js";
import { createDb } from "@worn/db";
import { sql } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const TOKEN = "a".repeat(48);

function agentConfig(env: Record<string, string> = {}): RenderConfig {
  return resolveRenderConfig({ RENDER_BACKEND: "agent", RENDER_AGENT_TOKEN: TOKEN, ...env });
}

function fakePush() {
  const send = vi.fn(async () => undefined);
  return { push: { send } as unknown as PushService, send };
}

/** A delivered order of `itemCount` lines for a user with coins and an avatar, renders seeded. */
async function deliveredOrder(repos: Repositories, itemCount = 1) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  await repos.grantCoins({ userId: user.id, delta: 500, type: "GRANT" });
  await repos.upsertAvatar({
    userId: user.id,
    referenceImageKey: `u/${user.id}/avatar/ref.jpg`,
    sourceUploadKeys: [],
    bodyMeta: {},
    status: "READY",
  });
  const listingId = randomUUID();
  const variantIds = Array.from({ length: itemCount }, () => randomUUID());
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Agent lease test",
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
    variantIds.map((id) => ({ id, listingId, size: "M", color: "Black", garmentImageKey: `garments/${id}.jpg` })),
  );
  const { order } = await repos.createOrder({
    userId: user.id,
    tier: "EXPRESS",
    coinTotal: 0,
    stateEta: {},
    items: variantIds.map((listingVariantId) => ({ listingVariantId, coinPriceSnapshot: 50, quantity: 1 })),
  });
  await repos.updateOrderState(order.id, "DELIVERED");
  const renders = await seedOrderRenders(repos, order.id);
  return { user, order, renders };
}

/** Leases until the queue is empty: a shared test database may hold older waiting jobs. */
async function leaseAll(deps: Parameters<typeof leaseJobsForAgent>[0], agentId: string, now = new Date()) {
  const all: Awaited<ReturnType<typeof leaseJobsForAgent>> = [];
  for (let round = 0; round < 100; round += 1) {
    const jobs = await leaseJobsForAgent(deps, { agentId, max: 100 }, now);
    all.push(...jobs);
    if (jobs.length < 100) break;
  }
  return all;
}

function leaseSuite(name: string, makeRepos: () => Repositories) {
  describe(name, () => {
    it("two concurrent leases never return the same job", async () => {
      const repos = makeRepos();
      const { order } = await deliveredOrder(repos, 4);
      const ours = new Set((await repos.findRendersByOrderId(order.id)).filter((r) => r.unlocked).map((r) => r.id));
      const at = new Date();
      const lease = (owner: string) =>
        repos.leaseAgentJobs({ owner, max: 50, now: at, leaseExpiresAt: new Date(at.getTime() + 600_000) });
      const [a, b] = await Promise.all([lease(`agent-a-${randomUUID()}`), lease(`agent-b-${randomUUID()}`)]);
      const aIds = a.map((j) => j.id);
      const bIds = b.map((j) => j.id);
      expect(aIds.filter((id) => bIds.includes(id))).toEqual([]);
      // Between them they took every one of this order's waiting renders.
      for (const id of ours) expect([...aIds, ...bIds]).toContain(id);
      for (const job of [...a, ...b].filter((j) => ours.has(j.id))) {
        expect(job.attempts).toBe(1);
        expect(job.kind === "render" && job.render.status).toBe("RUNNING");
      }
    });

    it("re-leases a job whose lease expired", async () => {
      const repos = makeRepos();
      const { order } = await deliveredOrder(repos);
      const deps = { repos, storage: createMockStorage(), push: fakePush().push, config: agentConfig() };
      const ours = (await repos.findRendersByOrderId(order.id)).find((r) => r.isFree)!;
      const t0 = new Date();
      const first = await leaseAll(deps, "mac-1", t0);
      expect(first.map((j) => j.id)).toContain(ours.id);
      // Still leased: another agent doesn't get it.
      const during = await leaseAll(deps, "mac-2", new Date(t0.getTime() + 60_000));
      expect(during.map((j) => j.id)).not.toContain(ours.id);
      // Past the lease (10 minutes), it is back in the queue and leased again.
      const later = new Date(t0.getTime() + 11 * 60_000);
      const again = await leaseAll(deps, "mac-2", later);
      const job = again.find((j) => j.id === ours.id);
      expect(job).toBeDefined();
      expect(job!.attempt).toBe(2);
      // The first agent no longer holds it.
      expect(await completeAgentJob(deps, { id: ours.id, agentId: "mac-1" })).not.toBe("done");
    });

    it("complete marks the render DONE, opens the reveal and sends the push", async () => {
      const repos = makeRepos();
      const { order } = await deliveredOrder(repos);
      const storage = createMockStorage();
      const { push, send } = fakePush();
      const deps = { repos, storage, push, config: agentConfig() };
      const free = (await repos.findRendersByOrderId(order.id)).filter((r) => r.isFree);
      const ids = new Set(free.map((r) => r.id));
      const jobs = (await leaseAll(deps, "mac")).filter((j) => ids.has(j.id));
      expect(jobs).toHaveLength(free.length);
      for (const job of jobs) {
        expect(job.kind).toBe("render");
        expect(job.garmentImageUrls).toHaveLength(1);
        expect(job.output.method).toBe("PUT");
        // Only ids and signed URLs: no user or order ids, and the output key carries no user id.
        expect(Object.keys(job).sort()).toEqual(
          ["attempt", "garmentImageUrls", "id", "kind", "leaseExpiresAt", "modelImageUrl", "output", "scenario"],
        );
        expect(JSON.stringify(job)).not.toContain(order.id);
        expect(job.output.url).not.toContain(order.userId);
      }

      // Not uploaded yet: refused, and the render stays leased.
      expect(await completeAgentJob(deps, { id: jobs[0]!.id, agentId: "mac" })).toBe("output_missing");

      for (const job of jobs) {
        const key = agentOutputKey({ kind: "render", id: job.id, attempts: job.attempt });
        await storage.put({ key, body: Buffer.from("jpeg"), contentType: "image/jpeg" });
        expect(await completeAgentJob(deps, { id: job.id, agentId: "mac" })).toBe("done");
        const render = await repos.findRenderById(job.id);
        expect(render).toMatchObject({ status: "DONE", imageKey: key, provider: "render-agent", leaseOwner: null });
      }
      expect((await repos.findOrderById(order.id))!.state).toBe("REVEAL_READY");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: order.id, eventType: "ORDER_REVEAL_READY" }),
      );
      // A repeat complete is not a second success.
      expect(await completeAgentJob(deps, { id: jobs[0]!.id, agentId: "mac" })).toBe("not_leased");
    });

    it("a retryable failure re-queues; past the limit a paid render is refunded once", async () => {
      const repos = makeRepos();
      const { user, order } = await deliveredOrder(repos);
      const deps = { repos, storage: createMockStorage(), push: fakePush().push, config: agentConfig() };
      const locked = (await repos.findRendersByOrderId(order.id)).find((r) => !r.isFree)!;
      // Settle the free renders first so only the paid one is in play for this order.
      for (const r of (await repos.findRendersByOrderId(order.id)).filter((x) => x.isFree)) {
        await repos.updateRender(r.id, { status: "DONE", imageKey: "renders/x.jpg" });
      }
      const unlock = await repos.unlockOrderRenders({
        userId: user.id,
        orderId: order.id,
        renderIds: [locked.id],
        costPerRender: REVEAL_UNLOCK_COST_COINS,
      });
      expect(unlock.status).toBe("unlocked");
      const afterUnlock = await repos.getCoinBalance(user.id);

      let t = new Date();
      for (let attempt = 1; attempt < deps.config.maxAttempts; attempt += 1) {
        const leased = await leaseAll(deps, "mac", t);
        expect(leased.find((j) => j.id === locked.id)?.attempt).toBe(attempt);
        const outcome = await failAgentJob(deps, { id: locked.id, agentId: "mac", retryable: true, reason: "timeout" });
        expect(outcome.status).toBe("requeued");
        expect((await repos.findRenderById(locked.id))!.status).toBe("QUEUED");
        t = new Date(t.getTime() + 1000);
      }
      const last = await leaseAll(deps, "mac", t);
      expect(last.find((j) => j.id === locked.id)?.attempt).toBe(deps.config.maxAttempts);
      const outcome = await failAgentJob(deps, { id: locked.id, agentId: "mac", retryable: true, reason: "timeout" });
      expect(outcome).toEqual({ status: "failed", coinsRefunded: REVEAL_UNLOCK_COST_COINS });
      expect((await repos.findRenderById(locked.id))!.status).toBe("FAILED");
      expect(await repos.getCoinBalance(user.id)).toBe(afterUnlock + REVEAL_UNLOCK_COST_COINS);

      // Reported again: nothing more is refunded.
      expect((await failAgentJob(deps, { id: locked.id, agentId: "mac", retryable: false, reason: "x" })).status).toBe(
        "not_leased",
      );
      expect(await repos.getCoinBalance(user.id)).toBe(afterUnlock + REVEAL_UNLOCK_COST_COINS);
    });

    it("a non-retryable failure fails a free render at once and still opens the reveal", async () => {
      const repos = makeRepos();
      const { order } = await deliveredOrder(repos);
      const deps = { repos, storage: createMockStorage(), push: fakePush().push, config: agentConfig() };
      const free = (await repos.findRendersByOrderId(order.id)).filter((r) => r.isFree);
      await leaseAll(deps, "mac");
      for (const r of free) {
        const outcome = await failAgentJob(deps, { id: r.id, agentId: "mac", retryable: false, reason: "bad input" });
        expect(outcome).toEqual({ status: "failed", coinsRefunded: 0 });
      }
      expect((await repos.findOrderById(order.id))!.state).toBe("REVEAL_READY");
    });
  });
}

leaseSuite("agent leases (memory)", () => createMemoryRepositories());

describe("a job that can't render", () => {
  it("fails at lease time, and the agent gets the next job instead", async () => {
    const repos = createMemoryRepositories();
    // The broken order is the older one, so it is leased first.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() - 60_000));
    // No avatar and no house-model photo: nothing to dress.
    const broken = await deliveredOrder(repos);
    vi.useRealTimers();
    await repos.upsertAvatar({
      userId: broken.user.id,
      referenceImageKey: null,
      sourceUploadKeys: [],
      bodyMeta: {},
      status: "PROCESSING",
    });
    const listing = await repos.findListingById(
      (await repos.findVariantById((await repos.listOrderItemsByOrderId(broken.order.id))[0]!.listingVariantId))!.listingId,
    );
    await repos.seedListings([{ ...listing!, houseModelRenderKey: "" }], []);
    const good = await deliveredOrder(repos);
    const deps = { repos, storage: createMockStorage(), push: fakePush().push, config: agentConfig() };

    const jobs = await leaseJobsForAgent(deps, { agentId: "mac", max: 1 });
    const goodFree = good.renders.find((r) => r.isFree)!;
    expect(jobs.map((j) => j.id)).toEqual([goodFree.id]);
    const brokenFree = broken.renders.find((r) => r.isFree)!;
    expect((await repos.findRenderById(brokenFree.id))!.status).toBe("FAILED");
  });
});
describePostgres("agent leases (postgres)", () => {
  leaseSuite("postgres", () => createPostgresRepositoriesFromUrl(databaseUrl!));

  it("the 0025 migration added the lease columns", async () => {
    const db = createDb(databaseUrl!);
    try {
      const rows = (await db.execute(sql`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_name IN ('renders', 'tryon_previews', 'render_agents')
          AND column_name IN ('lease_owner', 'lease_expires_at', 'attempts', 'last_heartbeat_at')`)) as unknown as Array<{
        table_name: string;
        column_name: string;
      }>;
      const found = rows.map((r) => `${r.table_name}.${r.column_name}`).sort();
      expect(found).toEqual([
        "render_agents.last_heartbeat_at",
        "renders.attempts",
        "renders.lease_expires_at",
        "renders.lease_owner",
        "tryon_previews.attempts",
        "tryon_previews.lease_expires_at",
        "tryon_previews.lease_owner",
      ]);
    } finally {
      await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    }
  });
});

// 12:00 and 01:00 in Asia/Kolkata (UTC+5:30).
const NOON_IST = new Date("2026-11-04T06:30:00.000Z");
const ONE_AM_IST = new Date("2026-11-04T19:30:00.000Z");

describe("overflow routing", () => {
  const night = agentConfig({ RENDER_AGENT_WINDOW: "23:00-06:30", RENDER_OVERFLOW: "fashn", FASHN_API_KEY: "k" });

  it("sends everything to FASHN outside the window, or while the agent is silent", () => {
    expect(overflowMode(night, { now: NOON_IST, lastHeartbeatAt: NOON_IST })).toBe("all");
    expect(overflowMode(night, { now: ONE_AM_IST, lastHeartbeatAt: new Date(ONE_AM_IST.getTime() - 4 * 60_000) })).toBe(
      "all",
    );
    expect(overflowMode(night, { now: ONE_AM_IST, lastHeartbeatAt: null })).toBe("all");
  });

  it("inside the window with the agent up, only jobs that waited too long", () => {
    expect(overflowMode(night, { now: ONE_AM_IST, lastHeartbeatAt: new Date(ONE_AM_IST.getTime() - 60_000) })).toBe(
      "waited",
    );
  });

  it("never with overflow off, or without a FASHN key", () => {
    const off = agentConfig({ RENDER_AGENT_WINDOW: "23:00-06:30" });
    expect(overflowMode(off, { now: NOON_IST, lastHeartbeatAt: null })).toBe("none");
    const noKey = agentConfig({ RENDER_AGENT_WINDOW: "23:00-06:30", RENDER_OVERFLOW: "fashn" });
    expect(overflowMode(noKey, { now: NOON_IST, lastHeartbeatAt: null })).toBe("none");
  });

  describe("the agent job queue", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function innerQueue() {
      const enqueueRender = vi.fn(async () => undefined);
      const inner = {
        enqueueAvatarProcessing: vi.fn(),
        enqueueTryonProcessing: vi.fn(async () => undefined),
        scheduleOrderLadder: vi.fn(),
        enqueueDeliveredRender: vi.fn(),
        enqueueRender,
      } as unknown as JobQueue;
      return { inner, enqueueRender };
    }

    it("keeps renders queued for the agent inside the window, and overflows them outside it", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(ONE_AM_IST);
      const repos = createMemoryRepositories();
      await repos.recordAgentHeartbeat({ agentId: "mac", version: "1", at: new Date() });
      const { order } = await deliveredOrder(repos);
      const free = (await repos.findRendersByOrderId(order.id)).filter((r) => r.isFree);
      const { inner, enqueueRender } = innerQueue();
      const queue = createAgentJobQueue(inner, { repos, storage: createMockStorage(), push: fakePush().push, config: night });

      // 01:00, agent up: the render waits for the agent.
      await queue.enqueueRender({ renderId: free[0]!.id, orderId: order.id });
      expect(enqueueRender).not.toHaveBeenCalled();
      expect((await repos.findRenderById(free[0]!.id))!.status).toBe("QUEUED");
      expect((await queue.sweep()).overflowed).toBe(0);

      // Still unleased 20 minutes later (agent heartbeating): overflow takes it.
      vi.setSystemTime(new Date(ONE_AM_IST.getTime() + 20 * 60_000));
      await repos.recordAgentHeartbeat({ agentId: "mac", version: "1", at: new Date() });
      expect((await queue.sweep()).overflowed).toBe(free.length);
      expect(enqueueRender).toHaveBeenCalledWith({ renderId: free[0]!.id, orderId: order.id });
      expect((await repos.findRenderById(free[0]!.id))!.leaseOwner).toBe(OVERFLOW_OWNER);
    });

    it("hands a render to FASHN at once when queued outside the window", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOON_IST);
      const repos = createMemoryRepositories();
      const { order } = await deliveredOrder(repos);
      const free = (await repos.findRendersByOrderId(order.id)).filter((r) => r.isFree);
      const { inner, enqueueRender } = innerQueue();
      const queue = createAgentJobQueue(inner, { repos, storage: createMockStorage(), push: fakePush().push, config: night });
      await queue.enqueueRender({ renderId: free[0]!.id, orderId: order.id });
      expect(enqueueRender).toHaveBeenCalledWith({ renderId: free[0]!.id, orderId: order.id });
    });

    it("with overflow off, jobs wait, and an agent silent for 5 minutes is reported once", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOON_IST);
      const repos = createMemoryRepositories();
      await repos.recordAgentHeartbeat({ agentId: "mac", version: "1", at: new Date() });
      await deliveredOrder(repos);
      const { inner, enqueueRender } = innerQueue();
      const onAgentDown = vi.fn();
      const queue = createAgentJobQueue(inner, {
        repos,
        storage: createMockStorage(),
        push: fakePush().push,
        config: agentConfig(),
        onAgentDown,
      });
      expect(await queue.sweep()).toEqual({ overflowed: 0, agentDown: false });
      vi.setSystemTime(new Date(NOON_IST.getTime() + 6 * 60_000));
      expect((await queue.sweep()).agentDown).toBe(true);
      await queue.sweep();
      expect(onAgentDown).toHaveBeenCalledTimes(1);
      expect(enqueueRender).not.toHaveBeenCalled();
    });
  });
});

describe("expectedReadyAt", () => {
  const always = agentConfig();
  const night = agentConfig({ RENDER_AGENT_WINDOW: "23:00-06:30" });
  const fresh = (at: Date) => new Date(at.getTime() - 30_000);

  it("is not waiting while the agent is up and the queue is short", () => {
    expect(renderWaitEstimate(always, { now: NOON_IST, lastHeartbeatAt: fresh(NOON_IST), pending: true, queueDepth: 3 })).toEqual({
      waiting: false,
      expectedReadyAt: null,
    });
    expect(
      renderWaitEstimate(resolveRenderConfig({ FASHN_API_KEY: "k" }), {
        now: NOON_IST,
        lastHeartbeatAt: null,
        pending: true,
        queueDepth: 100,
      }).waiting,
    ).toBe(false);
  });

  it("estimates from the queue when it is backed up", () => {
    const estimate = renderWaitEstimate(always, {
      now: NOON_IST,
      lastHeartbeatAt: fresh(NOON_IST),
      pending: true,
      queueDepth: 60,
    });
    // 60 renders × 60 s, plus a 30-minute margin.
    expect(estimate).toEqual({
      waiting: true,
      expectedReadyAt: new Date(NOON_IST.getTime() + 90 * 60_000).toISOString(),
    });
  });

  it("says shortly (no time) while the agent is down", () => {
    expect(renderWaitEstimate(always, { now: NOON_IST, lastHeartbeatAt: null, pending: true, queueDepth: 2 })).toEqual({
      waiting: true,
      expectedReadyAt: null,
    });
  });

  it("outside a night window, counts from when the window opens", () => {
    const estimate = renderWaitEstimate(night, { now: NOON_IST, lastHeartbeatAt: null, pending: true, queueDepth: 2 });
    // 23:00 IST (17:30 UTC) + 2 renders + 30 minutes.
    expect(estimate).toEqual({ waiting: true, expectedReadyAt: "2026-11-04T18:02:00.000Z" });
  });

  it("never promises later than the night window's end plus the margin", () => {
    const estimate = renderWaitEstimate(night, { now: NOON_IST, lastHeartbeatAt: null, pending: true, queueDepth: 5000 });
    // 06:30 IST (01:00 UTC) + 30 minutes.
    expect(estimate.expectedReadyAt).toBe("2026-11-05T01:30:00.000Z");
  });
});
