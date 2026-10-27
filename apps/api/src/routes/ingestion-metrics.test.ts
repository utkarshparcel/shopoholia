import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";

describe("ingestion metrics (coverage / cost/dashboard)", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  let token: string;

  beforeEach(async () => {
    const s = await buildTestServer();
    app = s.app;
    const session = await login(app);
    token = session.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects unauthenticated metrics fetch with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/ingestion/metrics" });
    expect(res.statusCode).toBe(401);
  });

  it("returns metrics shape when authenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ingestion/metrics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      totalMessages: number;
      specificHits: number;
      genericHits: number;
      misses: number;
      coverage: number;
      byStatus: Record<string, number>;
      byKind: Record<string, number>;
      byMerchant: Record<string, number>;
      costEstimate: { perMessageMinor: number; estimatedTotalMinor: number; currency: string };
      note: string;
    };
    expect(typeof body.totalMessages).toBe("number");
    expect(typeof body.coverage).toBe("number");
    expect(body.byStatus).toBeDefined();
    expect(body.byKind).toBeDefined();
    expect(body.byMerchant).toBeDefined();
    expect(body.costEstimate.perMessageMinor).toBeGreaterThan(0);
    expect(body.note).toContain("Grafana");
  });

  it("reflects ingested SMS documents in metrics", async () => {
    // Create an SMS document via the ingestion route (needs SMS consent)
    const { userId } = await (async () => {
      // derive userId from the existing token's JWT payload
      const decoded = app.jwt.verify(token) as { sub: string };
      return { userId: decoded.sub };
    })();
    const grant = await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "SMS", source: "test" },
    });
    expect(grant.statusCode).toBe(201);
    const sms = await app.inject({
      method: "POST",
      url: "/ingestion/sms",
      headers: { authorization: `Bearer ${token}` },
      payload: { from: "+919999999999", body: "Flipkart order shipped Rs. 749" },
    });
    expect(sms.statusCode).toBe(202);

    const res = await app.inject({
      method: "GET",
      url: "/ingestion/metrics",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json() as { totalMessages: number; byKind: Record<string, number> };
    expect(body.totalMessages).toBeGreaterThanOrEqual(1);
    expect(body.byKind["SMS"]).toBeGreaterThanOrEqual(1);
  });

  it("scopes metrics to the authenticated user (never global)", async () => {
    const decoded = app.jwt.verify(token) as { sub: string };
    const userId = decoded.sub;

    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "SMS", source: "test" },
    });
    await app.inject({
      method: "POST",
      url: "/ingestion/sms",
      headers: { authorization: `Bearer ${token}` },
      payload: { from: "+911111111111", body: "My order Rs. 100" },
    });

    // Second user with their own SMS docs must not inflate user A's metrics.
    const other = await login(app, "919111111111");
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { userId: other.userId, scope: "SMS", source: "test" },
    });
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST",
        url: "/ingestion/sms",
        headers: { authorization: `Bearer ${other.accessToken}` },
        payload: { from: "+912222222222", body: `Other order ${i}` },
      });
    }

    const mine = await app.inject({
      method: "GET",
      url: "/ingestion/metrics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mine.statusCode).toBe(200);
    const mineBody = mine.json() as { totalMessages: number; byKind: Record<string, number> };
    expect(mineBody.totalMessages).toBe(1);
    expect(mineBody.byKind["SMS"]).toBe(1);

    const theirs = await app.inject({
      method: "GET",
      url: "/ingestion/metrics",
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(theirs.statusCode).toBe(200);
    const theirsBody = theirs.json() as { totalMessages: number };
    expect(theirsBody.totalMessages).toBe(3);
  });
});
