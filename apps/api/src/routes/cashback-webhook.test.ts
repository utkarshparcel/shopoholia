import type * as Crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTestServer } from "../test-utils.js";

// The real timingSafeEqual, watched, so the test can tell the secret went through it.
const timingSafeEqual = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  return {
    ...actual,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      timingSafeEqual.calls += 1;
      return actual.timingSafeEqual(a, b);
    },
  };
});

const SECRET = "cashback-webhook-secret-0123456789";

function webhook(app: Awaited<ReturnType<typeof buildTestServer>>["app"], headers: Record<string, string | string[]>) {
  return app.inject({
    method: "POST",
    url: "/cashback/webhook",
    headers,
    payload: { clickId: "net-click-unknown", status: "CONFIRMED" },
  });
}

describe("cashback webhook secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    timingSafeEqual.calls = 0;
  });

  for (const nodeEnv of ["test", "production"]) {
    it(`checks the secret in constant time (NODE_ENV=${nodeEnv})`, async () => {
      const { app } = await buildTestServer();
      vi.stubEnv("CASHBACK_WEBHOOK_SECRET", SECRET);
      vi.stubEnv("NODE_ENV", nodeEnv);

      expect((await webhook(app, { "x-webhook-secret": SECRET })).statusCode).toBe(200);
      expect(timingSafeEqual.calls).toBe(1);
      // Same length, last character wrong: compared in constant time and refused.
      expect((await webhook(app, { "x-webhook-secret": `${SECRET.slice(0, -1)}X` })).statusCode).toBe(401);
      expect(timingSafeEqual.calls).toBe(2);

      expect((await webhook(app, { "x-webhook-secret": "short" })).statusCode).toBe(401);
      expect((await webhook(app, {})).statusCode).toBe(401);
      expect((await webhook(app, { "x-webhook-secret": [SECRET, SECRET] })).statusCode).toBe(401);
      await app.close();
    });
  }

  it("is closed outside tests when no secret is configured", async () => {
    const { app } = await buildTestServer();
    vi.stubEnv("CASHBACK_WEBHOOK_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect((await webhook(app, { "x-webhook-secret": "" })).statusCode).toBe(503);
    await app.close();
  });
});
