import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import { captureException } from "./lib/sentry.js";
import type * as SentryModule from "./lib/sentry.js";

vi.mock("./lib/sentry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof SentryModule>();
  return { ...actual, captureException: vi.fn() };
});

describe("server errors", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function failingServer() {
    const app = await buildServer({ logger: false });
    app.get("/boom", async () => {
      throw new Error('relation "users" violates constraint for user 1f2e3d4c');
    });
    return app;
  }

  it("in production, a 500 never carries the internal message", async () => {
    const app = await failingServer();
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = await app.inject({ method: "GET", url: "/boom" });
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toMatch(/relation|constraint|1f2e3d4c/);
      expect(res.json()).toMatchObject({ error: "Internal Server Error" });
      // Still reported, with the real error.
      expect(vi.mocked(captureException)).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("violates constraint") }),
        expect.anything(),
      );
      // Client errors keep their message.
      const bad = await app.inject({ method: "GET", url: "/orders/not-a-uuid", headers: {} });
      expect(bad.statusCode).toBeLessThan(500);
    } finally {
      await app.close();
    }
  });
});
