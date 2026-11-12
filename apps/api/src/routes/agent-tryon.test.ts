import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import type { Repositories } from "../lib/repositories/types.js";
import { resolveRenderConfig } from "../lib/render/backend.js";
import { login } from "../test-utils.js";

const TOKEN = "t".repeat(64);

async function agentServer(env: Record<string, string> = {}) {
  const repos = createMemoryRepositories();
  const renderConfig = resolveRenderConfig({ RENDER_BACKEND: "agent", RENDER_AGENT_TOKEN: TOKEN, ...env });
  const app = await buildServer({ logger: false, deps: { repos, renderConfig } });
  return { app, repos };
}

/** An active listing and a ready avatar for `userId`; returns the try-on URL and body. */
async function tryonFor(repos: Repositories, userId: string) {
  const listingId = randomUUID();
  const variantId = randomUUID();
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Agent try-on test",
        category: "TOPS",
        tags: [],
        coinPrice: 50,
        realPrice: null,
        productImageKeys: [],
        houseModelRenderKey: `house-models/${listingId}.jpg`,
        affiliateUrl: null,
        affiliateLinks: null,
        status: "ACTIVE",
        sortOrder: 0,
        createdAt: new Date(),
      },
    ],
    [{ id: variantId, listingId, size: "M", color: "Black", garmentImageKey: `garments/${variantId}.jpg` }],
  );
  await repos.upsertAvatar({
    userId,
    referenceImageKey: `u/${userId}/avatar/ref.jpg`,
    sourceUploadKeys: [],
    bodyMeta: {},
    status: "READY",
  });
  return { url: `/listings/${listingId}/tryon`, payload: { variantId } };
}

describe("the listing try-on preview with the render agent", () => {
  let close: (() => Promise<unknown>) | null = null;
  afterEach(async () => {
    vi.useRealTimers();
    await close?.();
    close = null;
  });

  it("says the preview is waiting while the agent is down, with no time (shortly)", async () => {
    const { app, repos } = await agentServer();
    close = () => app.close();
    const { accessToken, userId } = await login(app);
    const tryon = await tryonFor(repos, userId);
    const headers = { authorization: `Bearer ${accessToken}` };

    const first = await app.inject({ method: "POST", ...tryon, headers });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ status: "PROCESSING", previewUrl: null, rendersWaiting: true, expectedReadyAt: null });

    // The agent checks in: the preview is on its way, no waiting state.
    await repos.recordAgentHeartbeat({ agentId: "mac", version: "1", at: new Date() });
    const after = await app.inject({ method: "POST", ...tryon, headers });
    expect(after.statusCode).toBe(202);
    expect(after.json()).toEqual({ status: "PROCESSING", previewUrl: null, rendersWaiting: false, expectedReadyAt: null });
  });

  it("outside a night window, gives the time the preview should be ready, as the reveal does", async () => {
    // 12:00 IST; the window opens at 23:00 IST (17:30 UTC).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T06:30:00.000Z"));
    const { app, repos } = await agentServer({ RENDER_AGENT_WINDOW: "23:00-06:30" });
    close = () => app.close();
    const { accessToken, userId } = await login(app);
    const tryon = await tryonFor(repos, userId);

    const res = await app.inject({ method: "POST", ...tryon, headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(202);
    // 23:00 IST + one job in the queue (this preview) + 30 minutes.
    expect(res.json()).toEqual({
      status: "PROCESSING",
      previewUrl: null,
      rendersWaiting: true,
      expectedReadyAt: "2026-11-04T18:01:00.000Z",
    });
  });

  it("is not waiting with the in-process renderer", async () => {
    const { app, repos } = await agentServer({ RENDER_BACKEND: "mock" });
    close = () => app.close();
    const { accessToken, userId } = await login(app);
    const tryon = await tryonFor(repos, userId);
    const res = await app.inject({ method: "POST", ...tryon, headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.json()).toMatchObject({ rendersWaiting: false, expectedReadyAt: null });
  });
});
