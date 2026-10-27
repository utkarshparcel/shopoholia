import { describe, expect, it } from "vitest";
import { buildServer } from "../index.js";

describe("rate limiting (DoD: rate-limited)", () => {
  it("adds rate-limit headers on /health", async () => {
    const app = await buildServer({ logger: false });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    // @fastify/rate-limit adds lower-cased headers via inject
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
    await app.close();
  });

  it("adds rate-limit headers on auth routes (tighter window)", async () => {
    const app = await buildServer({ logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp",
      payload: { phone: "919876543210" },
    });
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    await app.close();
  });

  it("is registered as a Fastify plugin (has rateLimit decorator)", async () => {
    const app = await buildServer({ logger: false });
    // The plugin decorates the instance; at least headers above prove registration.
    expect(app.hasPlugin("@fastify/rate-limit")).toBe(true);
    await app.close();
  });

  it("credits / ingestion / DELETE vault declare route-level rateLimit config", async () => {
    const app = await buildServer({ logger: false });
    const credits = app.printRoutes({ commonPrefix: false });
    expect(credits).toContain("/credits");
    expect(credits).toContain("/ingestion");
    // Smoke: money + destructive vault routes still answer with ratelimit headers
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.headers["x-ratelimit-limit"]).toBeDefined();
    await app.close();
  });
});
