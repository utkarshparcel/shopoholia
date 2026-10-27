import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { createMockStorage } from "../lib/storage/r2.js";
import { createMemoryJobQueue } from "../lib/jobs/queue.js";
import { createMockRenderProvider } from "../lib/render/provider.js";
import { createStubPushService } from "../lib/push/stub.js";
import { createDevOtpService } from "../lib/auth/otp.js";
import { createAvatarProcessingHandler } from "../lib/jobs/avatar-processing.js";
import { createTryonProcessingHandler } from "../lib/jobs/tryon-processing.js";
import { createOrderTransitionHandler } from "../lib/jobs/order-processing.js";
import {
  createDeliveredRenderHandler,
  createRenderProcessingHandler,
} from "../lib/jobs/render-processing.js";
import { OAUTH_STATE_TTL_MS, createOauthState, signState, verifyState } from "./ingestion.js";

/** The signed state inside a Google consent URL. */
function stateOf(oauthUrl: string): string {
  return new URL(oauthUrl).searchParams.get("state")!;
}

process.env.INGEST_WEBHOOK_SECRET = "test-webhook-secret";

async function buildTestDeps() {
  const repos = createMemoryRepositories();
  const storage = createMockStorage();
  const renderProvider = createMockRenderProvider();
  const push = createStubPushService(repos);
  const avatarHandler = createAvatarProcessingHandler({ repos, storage, renderProvider });
  const tryonHandler = createTryonProcessingHandler({ repos, storage, renderProvider });
  const renderHandler = createRenderProcessingHandler({ repos, storage, renderProvider, push });
  const jobQueue = createMemoryJobQueue(
    {
      avatar: avatarHandler,
      tryon: tryonHandler,
      orderTransition: createOrderTransitionHandler({
        repos,
        push,
        onDelivered: async () => undefined,
      }),
      deliveredRender: createDeliveredRenderHandler({ repos, enqueueRender: async () => undefined }),
      render: renderHandler,
    },
    { autoProcess: false, repos },
  );
  const otp = createDevOtpService(repos);
  return { repos, storage, renderProvider, jobQueue, otp, push };
}

async function login(
  app: Awaited<ReturnType<typeof buildServer>>,
  phone = "919876543210",
): Promise<{ token: string; userId: string }> {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  const body = verify.json() as { accessToken: string };
  const decoded = app.jwt.verify(body.accessToken) as { sub: string };
  return { token: body.accessToken, userId: decoded.sub };
}

async function grantConsent(
  app: Awaited<ReturnType<typeof buildServer>>,
  token: string,
  userId: string,
  scope: "EMAIL" | "SMS",
) {
  const res = await app.inject({
    method: "POST",
    url: "/vault/consent",
    headers: { authorization: `Bearer ${token}` },
    payload: { userId, scope, source: "test" },
  });
  expect(res.statusCode).toBe(201);
}

describe("ingestion routes", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    const auth = await login(app);
    token = auth.token;
    userId = auth.userId;
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /ingestion/sources requires EMAIL consent (403 without, 201 with)", async () => {
    const noConsent = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    expect(noConsent.statusCode).toBe(403);

    await grantConsent(app, token, userId, "EMAIL");
    const res = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { source: { id: string }; oauthUrl: string };
    expect(body.source.id).toBeTruthy();
    expect(body.oauthUrl).toContain("accounts.google.com");
    expect(verifyState(stateOf(body.oauthUrl))).toMatchObject({ userId, sourceId: body.source.id });
  });

  it("POST /ingestion/sources answers 503 before the consent check when Gmail connect is unset", async () => {
    // A production server without GOOGLE_CLIENT_ID / OAUTH_STATE_SECRET.
    const postUnconfigured = async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("OAUTH_STATE_SECRET", "");
      try {
        return await app.inject({
          method: "POST",
          url: "/ingestion/sources",
          headers: { authorization: `Bearer ${token}` },
          payload: { kind: "EMAIL", provider: "gmail" },
        });
      } finally {
        vi.unstubAllEnvs();
      }
    };
    const noConsent = await postUnconfigured();
    expect(noConsent.statusCode).toBe(503);
    expect(noConsent.json()).toMatchObject({ message: "Email connect is unavailable" });

    await grantConsent(app, token, userId, "EMAIL");
    expect((await postUnconfigured()).statusCode).toBe(503);
    expect(await app.deps.repos.listIngestionSources(userId)).toHaveLength(0);
  });

  it("GET /ingestion/sources lists created sources", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { sources: unknown[] }).sources).toHaveLength(1);
  });

  it("POST /ingestion/sms requires SMS consent and creates a document", async () => {
    const noConsent = await app.inject({
      method: "POST",
      url: "/ingestion/sms",
      headers: { authorization: `Bearer ${token}` },
      payload: { from: "+919999999999", body: "Order shipped" },
    });
    expect(noConsent.statusCode).toBe(403);

    await grantConsent(app, token, userId, "SMS");
    const res = await app.inject({
      method: "POST",
      url: "/ingestion/sms",
      headers: { authorization: `Bearer ${token}` },
      payload: { from: "+919999999999", body: "Flipkart: order #FK-X129 shipped. Total Rs. 749.00" },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { id: string; status: string };
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("RECEIVED");

    const doc = await app.deps.repos.getIngestionDocumentById(body.id);
    expect(doc).not.toBeNull();
    expect(doc!.kind).toBe("SMS");
    expect(doc!.parsedJson).toMatchObject({
      from: "+919999999999",
      body: "Flipkart: order #FK-X129 shipped. Total Rs. 749.00",
    });
  });

  it("POST /webhooks/email rejects an invalid secret and accepts a valid one", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/webhooks/email",
      headers: { "x-webhook-secret": "wrong" },
      payload: { foo: "bar" },
    });
    expect(bad.statusCode).toBe(401);

    const ok = await app.inject({
      method: "POST",
      url: "/webhooks/email",
      headers: { "x-webhook-secret": "test-webhook-secret" },
      payload: { foo: "bar" },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { received: boolean }).received).toBe(true);
  });

  it("OAuth callback accepts signed state when source consent grant is active", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const { source, oauthUrl } = created.json() as { source: { id: string }; oauthUrl: string };
    const sourceId = source.id;
    const state = encodeURIComponent(stateOf(oauthUrl));

    const res = await app.inject({
      method: "GET",
      url: `/ingestion/sources/oauth/callback?code=test-code&state=${state}`,
    });
    expect(res.statusCode).toBe(202);
    expect((res.json() as { sourceId: string }).sourceId).toBe(sourceId);
  });

  it("OAuth callback returns 403 when source consent grant is not among active consents", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const { oauthUrl } = created.json() as { oauthUrl: string };

    // Revoke EMAIL consent — grant id on the source is no longer active.
    const revoke = await app.inject({
      method: "DELETE",
      url: "/vault/consent/EMAIL",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoke.statusCode).toBe(204);

    // Re-grant so the user has *some* EMAIL consent, but a new grant id.
    await grantConsent(app, token, userId, "EMAIL");

    const state = encodeURIComponent(stateOf(oauthUrl));
    const res = await app.inject({
      method: "GET",
      url: `/ingestion/sources/oauth/callback?code=test-code&state=${state}`,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { message: string }).message).toMatch(/consent grant/i);
  });

  it("GET /ingestion/activity requires EMAIL consent and never returns raw body/tokens", async () => {
    const noConsent = await app.inject({
      method: "GET",
      url: "/ingestion/activity",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(noConsent.statusCode).toBe(403);

    await grantConsent(app, token, userId, "EMAIL");

    const secretBody =
      "FULL SECRET EMAIL BODY with order details and a token=abc123refresh";
    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "ingestion/email/raw-secret-key",
      parsedJson: {
        merchant: "Amazon",
        subject: "Your Amazon.in order #A-100",
        body: secretBody,
        totalMinor: 49900,
        currency: "INR",
        accessToken: "leak-me-please",
      },
    });
    await app.deps.repos.updateIngestionDocumentStatus(doc.id, "MATCHED");

    const res = await app.inject({
      method: "GET",
      url: "/ingestion/activity",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{
        id: string;
        merchant: string | null;
        subject: string | null;
        snippet: string | null;
        status: string;
        totalMinor: number | null;
      }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(doc.id);
    expect(body.items[0].merchant).toBe("Amazon");
    expect(body.items[0].subject).toContain("Amazon");
    expect(body.items[0].totalMinor).toBe(49900);
    expect(body.items[0].status).toBe("MATCHED");

    const raw = JSON.stringify(body);
    expect(raw).not.toContain(secretBody);
    expect(raw).not.toContain("leak-me-please");
    expect(raw).not.toContain("raw-secret-key");
    expect(raw).not.toContain("accessToken");
  });

  it("GET /ingestion/sources/:id/reads lists activity for owned source", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;

    await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k1",
      parsedJson: { merchant: "Myntra", subject: "Shipped", snippet: "Order on the way" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/ingestion/sources/${sourceId}/reads`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /ingestion/documents/:id/correct requires EMAIL consent and patches purchase", async () => {
    const phantomId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const noConsent = await app.inject({
      method: "POST",
      url: `/ingestion/documents/${phantomId}/correct`,
      headers: { authorization: `Bearer ${token}` },
      payload: { totalMinor: 100 },
    });
    expect(noConsent.statusCode).toBe(403);

    await grantConsent(app, token, userId, "EMAIL");

    const { purchase } = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Flipkart",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 99900,
      items: [{ title: "Tee", priceMinor: 99900, qty: 1 }],
    });

    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-correct",
      parsedJson: {
        merchant: "Flipkart",
        subject: "Your order",
        totalMinor: 99900,
        currency: "INR",
      },
    });
    await app.deps.repos.updateIngestionDocumentStatus(doc.id, "MATCHED", purchase.id);

    const res = await app.inject({
      method: "POST",
      url: `/ingestion/documents/${doc.id}/correct`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Flipkart Fashion",
        totalMinor: 89900,
        currency: "INR",
        items: [{ title: "Tee sale", priceMinor: 89900, qty: 1 }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      id: string;
      merchant: string;
      totalMinor: number;
      matchedPurchaseId: string;
    };
    expect(body.id).toBe(doc.id);
    expect(body.merchant).toBe("Flipkart Fashion");
    expect(body.totalMinor).toBe(89900);
    expect(body.matchedPurchaseId).toBe(purchase.id);

    const updatedDoc = await app.deps.repos.getIngestionDocumentById(doc.id);
    expect(updatedDoc!.parsedJson.totalMinor).toBe(89900);
    expect(updatedDoc!.parsedJson.merchant).toBe("Flipkart Fashion");
    expect(updatedDoc!.parsedJson.correctedBy).toBe("user");

    const updatedPurchase = await app.deps.repos.findMerchantPurchaseById(purchase.id);
    expect(updatedPurchase!.totalMinor).toBe(89900);
    expect(updatedPurchase!.merchant).toBe("Flipkart Fashion");

    const items = await app.deps.repos.listMerchantPurchaseItems(purchase.id);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Tee sale");
    expect(items[0].priceMinor).toBe(89900);
  });

  it("PATCH /ingestion/sources/:id pauses and mutes merchants on meta", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;

    const res = await app.inject({
      method: "PATCH",
      url: `/ingestion/sources/${sourceId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "PAUSED", mutedMerchants: ["SWIGGY", "ZOMATO"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      source: { status: string; meta: { mutedMerchants: string[] } | null };
    };
    expect(body.source.status).toBe("PAUSED");
    expect(body.source.meta?.mutedMerchants).toEqual(["SWIGGY", "ZOMATO"]);
  });

  it("DELETE /ingestion/sources/:id disconnects source (clears token, status ERROR)", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;
    await app.deps.repos.updateIngestionSourceToken(sourceId, { data: "enc-token" });

    const res = await app.inject({
      method: "DELETE",
      url: `/ingestion/sources/${sourceId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);

    const after = await app.deps.repos.getIngestionSourceById(sourceId);
    expect(after?.status).toBe("ERROR");
    expect(after?.encryptedToken).toBeNull();
    expect((after?.meta as { disconnectedAt?: string } | null)?.disconnectedAt).toBeTruthy();
    expect((after?.meta as { errorCode?: string } | null)?.errorCode).toBe("DISCONNECTED");
    expect((after?.meta as { lastError?: string } | null)?.lastError).toMatch(/reconnect/i);

    const listed = await app.inject({
      method: "GET",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.statusCode).toBe(200);
    const sources = (
      listed.json() as {
        sources: Array<{
          id: string;
          status: string;
          lastSyncAt: string | null;
          error: string | null;
          hasToken: boolean;
          health: {
            tone: string;
            needsReconnect: boolean;
            error: string | null;
          };
        }>;
      }
    ).sources;
    const row = sources.find((s) => s.id === sourceId);
    expect(row?.hasToken).toBe(false);
    expect(row?.error).toMatch(/reconnect/i);
    expect(row?.health.tone).toBe("needs_reconnect");
    expect(row?.health.needsReconnect).toBe(true);
  });

  it("GET /ingestion/sources includes health for healthy sources", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;
    await app.deps.repos.updateIngestionSourceToken(sourceId, { data: "enc-token" });
    await app.deps.repos.updateIngestionSourceCursor(sourceId, "cursor-1");

    const listed = await app.inject({
      method: "GET",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
    });
    const row = (
      listed.json() as {
        sources: Array<{
          id: string;
          hasToken: boolean;
          health: { tone: string; needsReconnect: boolean; label: string };
        }>;
      }
    ).sources.find((s) => s.id === sourceId);
    expect(row?.hasToken).toBe(true);
    expect(row?.health.tone).toBe("ok");
    expect(row?.health.needsReconnect).toBe(false);
    expect(row?.health.label).toBe("Healthy");
  });

  it("verifyState rejects tampered, expired, unsigned and old-format states", () => {
    const fields = {
      userId,
      sourceId: "00000000-0000-4000-8000-0000000000aa",
      kind: "EMAIL",
      nonce: "n-1",
      exp: Date.now() + OAUTH_STATE_TTL_MS,
    };
    const signed = signState(fields);
    expect(verifyState(signed)?.userId).toBe(userId);
    expect(verifyState(`${signed}x`)).toBeNull();
    expect(verifyState(`${signed.split(".")[0]}x.${signed.split(".")[1]}`)).toBeNull();
    expect(verifyState(signed, fields.exp + 1)).toBeNull();
    expect(verifyState(JSON.stringify({ userId, sourceId: "x" }))).toBeNull();
    expect(verifyState("not-json")).toBeNull();
    // The old JSON-plus-hex-HMAC state has no nonce or expiry and is refused.
    expect(verifyState(`${JSON.stringify({ userId, sourceId: fields.sourceId, kind: "EMAIL" })}.${"0".repeat(64)}`)).toBeNull();
  });

  it("OAuth callback returns 400 for invalid state", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ingestion/sources/oauth/callback?code=abc&state=garbage",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/invalid state/i);
  });

  it("OAuth callback returns 404 when source is missing", async () => {
    const missingId = "00000000-0000-4000-8000-0000000000ff";
    const state = encodeURIComponent(await createOauthState(app.deps.repos, userId, missingId));
    const res = await app.inject({
      method: "GET",
      url: `/ingestion/sources/oauth/callback?code=abc&state=${state}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH /ingestion/sources/:id returns 404 for unknown source", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const res = await app.inject({
      method: "PATCH",
      url: "/ingestion/sources/00000000-0000-4000-8000-0000000000ee",
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "PAUSED" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /ingestion/sources/:id returns 404 for unknown source", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/ingestion/sources/00000000-0000-4000-8000-0000000000ee",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH /ingestion/sources/:id returns 404 for another user's source", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;

    const other = await login(app, "919800000001");
    await grantConsent(app, other.token, other.userId, "EMAIL");
    const res = await app.inject({
      method: "PATCH",
      url: `/ingestion/sources/${sourceId}`,
      headers: { authorization: `Bearer ${other.token}` },
      payload: { mutedMerchants: ["SWIGGY"] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /ingestion/documents/:id/correct returns 404 for unknown document", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const res = await app.inject({
      method: "POST",
      url: "/ingestion/documents/00000000-0000-4000-8000-0000000000dd/correct",
      headers: { authorization: `Bearer ${token}` },
      payload: { merchant: "Amazon", totalMinor: 100 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("OAuth callback returns 403 when JWT user mismatches signed state", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const { oauthUrl } = created.json() as { oauthUrl: string };
    const state = encodeURIComponent(stateOf(oauthUrl));

    const other = await login(app, "919999988877");
    const res = await app.inject({
      method: "GET",
      url: `/ingestion/sources/oauth/callback?code=test-code&state=${state}`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { message: string }).message).toMatch(/State mismatch/i);
  });

  it("OAuth callback refuses legacy unsigned state, even with the user's JWT", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;
    const legacy = encodeURIComponent(JSON.stringify({ userId, sourceId }));

    const res = await app.inject({
      method: "GET",
      url: `/ingestion/sources/oauth/callback?code=legacy-code&state=${legacy}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("correct resolves ownership via the owner column when the list omits the doc", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-orphan-list",
      parsedJson: { merchant: "Nykaa", totalMinor: 1200, currency: "INR" },
    });
    const origList = app.deps.repos.listIngestionDocumentsByUser.bind(app.deps.repos);
    app.deps.repos.listIngestionDocumentsByUser = async () => [];
    try {
      const res = await app.inject({
        method: "POST",
        url: `/ingestion/documents/${doc.id}/correct`,
        headers: { authorization: `Bearer ${token}` },
        payload: { merchant: "Nykaa Beauty", totalMinor: 1100 },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { merchant: string }).merchant).toBe("Nykaa Beauty");
    } finally {
      app.deps.repos.listIngestionDocumentsByUser = origList;
    }
  });

  it("correct returns 404 when updateIngestionDocumentParsedJson races to null", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-race-update",
      parsedJson: { merchant: "Amazon", totalMinor: 500 },
    });
    const orig = app.deps.repos.updateIngestionDocumentParsedJson.bind(app.deps.repos);
    app.deps.repos.updateIngestionDocumentParsedJson = async () => null;
    try {
      const res = await app.inject({
        method: "POST",
        url: `/ingestion/documents/${doc.id}/correct`,
        headers: { authorization: `Bearer ${token}` },
        payload: { totalMinor: 400 },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      app.deps.repos.updateIngestionDocumentParsedJson = orig;
    }
  });

  it("GET /ingestion/sources/:id/reads returns 404 for unknown source", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const res = await app.inject({
      method: "GET",
      url: "/ingestion/sources/00000000-0000-4000-8000-0000000000aa/reads",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /ingestion/sources/:id/reads returns 404 for another user's source", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;

    const other = await login(app, "919800000099");
    await grantConsent(app, other.token, other.userId, "EMAIL");
    const res = await app.inject({
      method: "GET",
      url: `/ingestion/sources/${sourceId}/reads`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("correct returns 404 when getIngestionDocumentById races to null after ownership", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-race-get",
      parsedJson: { merchant: "Amazon", totalMinor: 500 },
    });
    const orig = app.deps.repos.getIngestionDocumentById.bind(app.deps.repos);
    app.deps.repos.getIngestionDocumentById = async () => null;
    try {
      const res = await app.inject({
        method: "POST",
        url: `/ingestion/documents/${doc.id}/correct`,
        headers: { authorization: `Bearer ${token}` },
        payload: { totalMinor: 400 },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      app.deps.repos.getIngestionDocumentById = orig;
    }
  });

  it("another user's document is 404 on correct, delete-raw and alias", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-owner-only",
      parsedJson: { merchant: "Ajio", totalMinor: 700 },
    });
    const other = await login(app, "919800000098");
    await grantConsent(app, other.token, other.userId, "EMAIL");
    const headers = { authorization: `Bearer ${other.token}` };
    const correct = await app.inject({
      method: "POST",
      url: `/ingestion/documents/${doc.id}/correct`,
      headers,
      payload: { totalMinor: 1 },
    });
    const raw = await app.inject({
      method: "POST",
      url: `/ingestion/documents/${doc.id}/delete-raw`,
      headers,
      payload: { confirm: true },
    });
    const alias = await app.inject({
      method: "POST",
      url: "/ingestion/merchant-aliases",
      headers,
      payload: { alias: "AJIO", canonical: "Ajio", documentId: doc.id },
    });
    expect([correct.statusCode, raw.statusCode, alias.statusCode]).toEqual([404, 404, 404]);
    const after = await app.deps.repos.getIngestionDocumentById(doc.id);
    expect(after?.rawKey).toBe("k-owner-only");
    expect(after?.parsedJson.totalMinor).toBe(700);
  });

  it("correct no longer writes the owner into parsed_json", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-no-owner-json",
      parsedJson: { merchant: "Ajio", totalMinor: 700 },
    });
    const res = await app.inject({
      method: "POST",
      url: `/ingestion/documents/${doc.id}/correct`,
      headers: { authorization: `Bearer ${token}` },
      payload: { totalMinor: 650 },
    });
    expect(res.statusCode).toBe(200);
    const after = await app.deps.repos.getIngestionDocumentById(doc.id);
    expect(after?.parsedJson).not.toHaveProperty("__userId");
    expect(after?.userId).toBe(userId);
  });

  it("activity reads one bounded page and joins purchases in one query", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    for (let i = 0; i < 4; i++) {
      const { purchase } = await app.deps.repos.createMerchantPurchase({
        userId,
        source: "EMAIL",
        merchant: `M${i}`,
        purchasedAt: new Date(),
        currency: "INR",
        totalMinor: 100 + i,
        items: [{ title: "Tee", priceMinor: 100 + i, qty: 1 }],
      });
      const doc = await app.deps.repos.createIngestionDocument({
        userId,
        kind: "EMAIL",
        rawKey: `k-act-${i}`,
        parsedJson: { merchant: `M${i}` },
      });
      await app.deps.repos.updateIngestionDocumentStatus(doc.id, "MATCHED", purchase.id);
    }
    const repos = app.deps.repos;
    const one = repos.findMerchantPurchaseById.bind(repos);
    const many = repos.findMerchantPurchasesByIds.bind(repos);
    const list = repos.listIngestionDocumentsByUser.bind(repos);
    let singleCalls = 0;
    let batchCalls = 0;
    let listLimit: number | undefined;
    repos.findMerchantPurchaseById = async (id) => {
      singleCalls++;
      return one(id);
    };
    repos.findMerchantPurchasesByIds = async (ids) => {
      batchCalls++;
      return many(ids);
    };
    repos.listIngestionDocumentsByUser = async (uid, opts) => {
      listLimit = opts?.limit;
      return list(uid, opts);
    };
    try {
      const res = await app.inject({
        method: "GET",
        url: "/ingestion/activity?limit=2",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { items: unknown[] }).items).toHaveLength(2);
      expect([singleCalls, batchCalls, listLimit]).toEqual([0, 1, 2]);
    } finally {
      repos.findMerchantPurchaseById = one;
      repos.findMerchantPurchasesByIds = many;
      repos.listIngestionDocumentsByUser = list;
    }
  });

  it("delete-raw reports a storage failure and keeps the key for a retry", async () => {
    const doc = await app.deps.repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k-flaky-raw",
      parsedJson: { merchant: "Ajio" },
    });
    const storage = app.deps.storage;
    const del = storage.delete.bind(storage);
    let calls = 0;
    storage.delete = async (key) => {
      calls++;
      if (calls === 1) throw new Error("R2 down");
      return del(key);
    };
    try {
      const first = await app.inject({
        method: "POST",
        url: `/ingestion/documents/${doc.id}/delete-raw`,
        headers: { authorization: `Bearer ${token}` },
        payload: { confirm: true },
      });
      expect(first.statusCode).toBe(503);
      expect((await app.deps.repos.getIngestionDocumentById(doc.id))?.rawKey).toBe("k-flaky-raw");
      const second = await app.inject({
        method: "POST",
        url: `/ingestion/documents/${doc.id}/delete-raw`,
        headers: { authorization: `Bearer ${token}` },
        payload: { confirm: true },
      });
      expect(second.statusCode).toBe(200);
      expect((await app.deps.repos.getIngestionDocumentById(doc.id))?.rawKey).toBe("");
      // A repeat is a no-op on storage.
      const third = await app.inject({
        method: "POST",
        url: `/ingestion/documents/${doc.id}/delete-raw`,
        headers: { authorization: `Bearer ${token}` },
        payload: { confirm: true },
      });
      expect(third.statusCode).toBe(200);
      expect(calls).toBe(2);
    } finally {
      storage.delete = del;
    }
  });

  it("in production, disconnect keeps the token when the revoke cannot be queued", async () => {
    await grantConsent(app, token, userId, "EMAIL");
    const created = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    const sourceId = (created.json() as { source: { id: string } }).source.id;
    await app.deps.repos.updateIngestionSourceToken(sourceId, { data: "enc-token" });
    const env = { NODE_ENV: process.env.NODE_ENV, REDIS_URL: process.env.REDIS_URL };
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;
    try {
      const res = await app.inject({
        method: "DELETE",
        url: `/ingestion/sources/${sourceId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(503);
      expect((await app.deps.repos.getIngestionSourceById(sourceId))?.encryptedToken).toEqual({ data: "enc-token" });
    } finally {
      process.env.NODE_ENV = env.NODE_ENV;
      if (env.REDIS_URL !== undefined) process.env.REDIS_URL = env.REDIS_URL;
    }
  });

  it("in production, the global parser flag needs the admin secret", async () => {
    const env = { NODE_ENV: process.env.NODE_ENV, ADMIN_SECRET: process.env.ADMIN_SECRET };
    process.env.NODE_ENV = "production";
    process.env.ADMIN_SECRET = "ops-secret";
    try {
      const flag = (headers: Record<string, string>) =>
        app.inject({
          method: "POST",
          url: "/ingestion/parser-health/flag",
          headers: { authorization: `Bearer ${token}`, ...headers },
          payload: { merchant: "Myntra", broken: true },
        });
      expect((await flag({})).statusCode).toBe(403);
      expect((await flag({ "x-admin-secret": "wrong" })).statusCode).toBe(403);
      expect((await flag({ "x-admin-secret": "ops-secret" })).statusCode).toBe(200);
    } finally {
      process.env.NODE_ENV = env.NODE_ENV;
      if (env.ADMIN_SECRET === undefined) delete process.env.ADMIN_SECRET;
      else process.env.ADMIN_SECRET = env.ADMIN_SECRET;
    }
  });
});
