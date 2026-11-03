import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { secretsEqual } from "../lib/auth/admin.js";
import { buildTestServer } from "../test-utils.js";

vi.mock("../lib/auth/admin.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth/admin.js")>();
  return { ...actual, secretsEqual: vi.fn(actual.secretsEqual) };
});

describe("ingest email webhook", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  const original = process.env.INGEST_WEBHOOK_SECRET;

  beforeEach(async () => {
    process.env.INGEST_WEBHOOK_SECRET = "test-secret";
    const s = await buildTestServer();
    app = s.app;
  });

  afterEach(async () => {
    await app.close();
    if (original === undefined) delete process.env.INGEST_WEBHOOK_SECRET;
    else process.env.INGEST_WEBHOOK_SECRET = original;
  });

  it("rejects requests without the shared secret (401)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/email",
      payload: { from: "a@b.com", raw: "..." },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts requests with the shared secret (200)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/email",
      headers: { "x-webhook-secret": "test-secret" },
      payload: { from: "a@b.com", raw: "..." },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  it("compares the secret in constant time and refuses near misses", async () => {
    const spy = vi.mocked(secretsEqual);
    spy.mockClear();
    for (const secret of ["test-secre", "test-secret-", "TEST-SECRET"]) {
      const res = await app.inject({
        method: "POST",
        url: "/webhooks/email",
        headers: { "x-webhook-secret": secret },
        payload: { from: "a@b.com", raw: "..." },
      });
      expect(res.statusCode, secret).toBe(401);
    }
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
