import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import type { Repositories } from "../lib/repositories/types.js";
import { resolveRenderConfig } from "../lib/render/backend.js";
import { seedOrderRenders } from "../lib/render/pipeline.js";
import { login } from "../test-utils.js";

const TOKEN = "t".repeat(64);

async function agentServer(env: Record<string, string> = {}) {
  const repos = createMemoryRepositories();
  const renderConfig = resolveRenderConfig({ RENDER_BACKEND: "agent", RENDER_AGENT_TOKEN: TOKEN, ...env });
  const app = await buildServer({ logger: false, deps: { repos, renderConfig } });
  return { app, repos };
}

async function deliveredOrderFor(repos: Repositories, userId: string) {
  const listingId = randomUUID();
  const variantId = randomUUID();
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Agent route test",
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
    [{ id: variantId, listingId, size: "M", color: "Black", garmentImageKey: `garments/${variantId}.jpg` }],
  );
  const { order } = await repos.createOrder({
    userId,
    tier: "EXPRESS",
    coinTotal: 0,
    stateEta: {},
    items: [{ listingVariantId: variantId, coinPriceSnapshot: 50, quantity: 1 }],
  });
  await repos.updateOrderState(order.id, "DELIVERED");
  await seedOrderRenders(repos, order.id);
  return order;
}

describe("render agent routes", () => {
  let close: (() => Promise<unknown>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  it.each([
    ["no token", undefined],
    ["a wrong token", `Bearer ${"x".repeat(64)}`],
    ["a token of another length", "Bearer short"],
  ])("refuses %s with 401", async (_label, authorization) => {
    const { app } = await agentServer();
    close = () => app.close();
    for (const url of ["/agent/renders/lease", "/agent/heartbeat", `/agent/renders/${randomUUID()}/complete`]) {
      const res = await app.inject({
        method: "POST",
        url,
        headers: authorization ? { authorization } : {},
        payload: url.endsWith("heartbeat") ? { agentId: "mac", version: "1" } : {},
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it("refuses a user's access token", async () => {
    const { app } = await agentServer();
    close = () => app.close();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/agent/renders/lease",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { max: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("refuses everyone when RENDER_AGENT_TOKEN is unset", async () => {
    const repos = createMemoryRepositories();
    const renderConfig = resolveRenderConfig({ RENDER_BACKEND: "agent" });
    const app = await buildServer({ logger: false, deps: { repos, renderConfig } });
    close = () => app.close();
    const res = await app.inject({
      method: "POST",
      url: "/agent/renders/lease",
      headers: { authorization: "Bearer " },
      payload: { max: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("leases a delivered order's renders, which no in-process job touched", async () => {
    const { app, repos } = await agentServer();
    close = () => app.close();
    const { userId } = await login(app);
    const order = await deliveredOrderFor(repos, userId);
    const auth = { authorization: `Bearer ${TOKEN}` };

    const beat = await app.inject({ method: "POST", url: "/agent/heartbeat", headers: auth, payload: { agentId: "mac", version: "0.1.0" } });
    expect(beat.statusCode).toBe(200);
    expect(await repos.latestAgentHeartbeat()).not.toBeNull();

    const res = await app.inject({ method: "POST", url: "/agent/renders/lease", headers: auth, payload: { max: 5, agentId: "mac" } });
    expect(res.statusCode).toBe(200);
    const { jobs } = res.json() as { jobs: Array<{ id: string; scenario: string; output: { url: string } }> };
    const free = (await repos.findRendersByOrderId(order.id)).filter((r) => r.isFree);
    expect(jobs.map((j) => j.id).sort()).toEqual(free.map((r) => r.id).sort());

    const fail = await app.inject({
      method: "POST",
      url: `/agent/renders/${jobs[0]!.id}/fail`,
      headers: auth,
      payload: { retryable: true, reason: "mediagen timed out", agentId: "mac" },
    });
    expect(fail.json()).toEqual({ status: "QUEUED" });

    const missing = await app.inject({
      method: "POST",
      url: `/agent/renders/${randomUUID()}/complete`,
      headers: auth,
      payload: { agentId: "mac" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("the reveal says the renders are waiting while the agent is down, with no time (shortly)", async () => {
    const { app, repos } = await agentServer();
    close = () => app.close();
    const { accessToken, userId } = await login(app);
    const order = await deliveredOrderFor(repos, userId);
    const reveal = await app.inject({
      method: "GET",
      url: `/orders/${order.id}/reveal`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(reveal.statusCode).toBe(200);
    expect(reveal.json()).toMatchObject({ rendersWaiting: true, expectedReadyAt: null });

    // The agent checks in: the renders are on their way, no waiting state.
    await repos.recordAgentHeartbeat({ agentId: "mac", version: "1", at: new Date() });
    const after = await app.inject({
      method: "GET",
      url: `/orders/${order.id}/reveal`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(after.json()).toMatchObject({ rendersWaiting: false, expectedReadyAt: null });
  });

  it("with a night window, the reveal gives the time the renders should be ready", async () => {
    const { app, repos } = await agentServer({ RENDER_AGENT_WINDOW: "23:00-06:30" });
    close = () => app.close();
    const { accessToken, userId } = await login(app);
    const order = await deliveredOrderFor(repos, userId);
    const now = Date.now();
    const reveal = (await app.inject({
      method: "GET",
      url: `/orders/${order.id}/reveal`,
      headers: { authorization: `Bearer ${accessToken}` },
    })).json() as { rendersWaiting: boolean; expectedReadyAt: string | null };
    // Outside the window it is the next window plus the queue; inside it with no agent, unknown.
    if (reveal.expectedReadyAt) {
      expect(reveal.rendersWaiting).toBe(true);
      expect(new Date(reveal.expectedReadyAt).getTime()).toBeGreaterThan(now);
      expect(new Date(reveal.expectedReadyAt).getTime()).toBeLessThan(now + 25 * 3600_000);
    } else {
      expect(reveal.rendersWaiting).toBe(true);
    }
  });
});
