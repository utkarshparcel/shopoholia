import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { buildTestServer, login } from "../test-utils.js";
import { requireConciergeConsentForUser } from "./concierge-ops.js";

describe("CONCIERGE-OPS requireConciergeConsentForUser", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  const originalSecret = process.env.ADMIN_SECRET;

  beforeEach(async () => {
    process.env.ADMIN_SECRET = "test-admin-secret";
    const s = await buildTestServer();
    app = s.app;
  });

  afterEach(async () => {
    await app.close();
    if (originalSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = originalSecret;
  });

  function asRequest(): FastifyRequest {
    return { server: app } as unknown as FastifyRequest;
  }

  it("returns false and sends 403 without active CONCIERGE consent", async () => {
    const { userId } = await login(app);
    let status: number | undefined;
    let body: { message?: string } | undefined;
    const reply = {
      code(code: number) {
        status = code;
        return this;
      },
      send(payload: { message?: string }) {
        body = payload;
        return this;
      },
    } as unknown as FastifyReply;

    const ok = await requireConciergeConsentForUser(asRequest(), reply, userId);
    expect(ok).toBe(false);
    expect(status).toBe(403);
    expect(body?.message).toMatch(/CONCIERGE/i);
  });

  it("returns true when CONCIERGE consent is active", async () => {
    const { accessToken, userId } = await login(app, "919933344455");
    const grant = await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "CONCIERGE", source: "unit" },
    });
    expect(grant.statusCode).toBe(201);

    const reply = {
      code() {
        throw new Error("should not reply when consented");
      },
      send() {
        throw new Error("should not reply when consented");
      },
    } as unknown as FastifyReply;

    const ok = await requireConciergeConsentForUser(asRequest(), reply, userId);
    expect(ok).toBe(true);
  });
});
