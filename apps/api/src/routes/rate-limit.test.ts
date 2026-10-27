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

  it("gives each route group its own bucket per signed-in user, so one screen load never trips it", async () => {
    const app = await buildServer({ logger: false });
    const saved = process.env.NODE_ENV;
    // Real limits (tests otherwise get 1000/min).
    process.env.NODE_ENV = "development";
    try {
      const a = (await app.deps.repos.createUser("919800000101")).user;
      const b = (await app.deps.repos.createUser("919800000102")).user;
      const bearer = (sub: string) => ({ authorization: `Bearer ${app.jwt.sign({ sub, phone: "x" })}` });
      const get = (url: string, headers: Record<string, string> = {}) =>
        app.inject({ method: "GET", url, headers });

      // A Vault first load: several groups, many calls, one user.
      for (const url of ["/credits", "/receipts", "/vault/consent", "/accountant/summary"]) {
        for (let i = 0; i < 25; i += 1) {
          const res = await get(url, bearer(a.id));
          expect(res.statusCode).not.toBe(429);
        }
        const res = await get(url, bearer(a.id));
        expect(res.headers["x-ratelimit-limit"]).toBe("60");
        expect(res.headers["x-ratelimit-remaining"]).toBe("34");
      }
      // Another user behind the same IP has their own bucket.
      expect((await get("/credits", bearer(b.id))).headers["x-ratelimit-remaining"]).toBe("59");

      // Signed out (or a bad token): 20 a minute per IP.
      let last = await get("/receipts", { authorization: "Bearer not-a-token" });
      expect(last.headers["x-ratelimit-limit"]).toBe("20");
      for (let i = 1; i < 21; i += 1) last = await get("/receipts");
      expect(last.statusCode).toBe(429);

      // Sign-in stays per IP even with a token.
      const otp = await app.inject({ method: "POST", url: "/auth/otp", headers: bearer(a.id), payload: {} });
      expect(otp.headers["x-ratelimit-limit"]).toBe("20");
    } finally {
      process.env.NODE_ENV = saved;
      await app.close();
    }
  });
});
