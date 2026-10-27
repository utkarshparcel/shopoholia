import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTestServer, login } from "../test-utils.js";
import {
  initServerAnalyticsFromEnv,
  resetServerAnalyticsSink,
  setServerAnalyticsSink,
  trackServerEvent,
} from "./analytics.js";

function buildMultipart(fileBuffer: Buffer, filename = "receipt.jpg") {
  const boundary = "----wornanalyticsboundary";
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head, "utf8"), fileBuffer, Buffer.from(tail, "utf8")]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("server analytics (analytics.ts)", () => {
  afterEach(() => {
    resetServerAnalyticsSink();
    delete process.env.ANALYTICS_WEBHOOK_URL;
    delete process.env.POSTHOG_KEY;
  });

  it("forwards events to the configured sink and never throws on bad sink", () => {
    const seen: Array<{ name: string; props?: Record<string, unknown> }> = [];
    setServerAnalyticsSink((name, properties) => {
      seen.push({ name, props: properties });
    });
    trackServerEvent("consent_granted", { userId: "u1", email: "a@b.co" });
    expect(seen).toEqual([
      { name: "consent_granted", props: { userId: "u1" } },
    ]);
    setServerAnalyticsSink(() => {
      throw new Error("boom");
    });
    expect(() => trackServerEvent("vault_deleted")).not.toThrow();
  });

  it("initServerAnalyticsFromEnv installs HTTP sink from ANALYTICS_WEBHOOK_URL", async () => {
    process.env.ANALYTICS_WEBHOOK_URL = "https://hooks.example/api";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      expect(initServerAnalyticsFromEnv()).toBe(true);
      trackServerEvent("ingestion_connected", { kind: "EMAIL" });
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
      expect(fetchImpl.mock.calls[0]![0]).toBe("https://hooks.example/api");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("server analytics — events on key routes", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  let token: string;
  let userId: string;
  let events: string[];

  beforeEach(async () => {
    events = [];
    setServerAnalyticsSink((name) => {
      events.push(name);
    });
    const s = await buildTestServer();
    app = s.app;
    const session = await login(app);
    token = session.accessToken;
    userId = session.userId;
  });

  afterEach(async () => {
    await app.close();
    resetServerAnalyticsSink();
  });

  async function grantConsent(scope: "EMAIL" | "SMS" | "FINANCIAL") {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope, source: "test" },
    });
  }

  it("emits consent_granted / consent_revoked", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "EMAIL", source: "test" },
    });
    await app.inject({
      method: "DELETE",
      url: "/vault/consent/EMAIL",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(events).toContain("consent_granted");
    expect(events).toContain("consent_revoked");
  });

  it("emits credit_added / credit_spent", async () => {
    await grantConsent("FINANCIAL");
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "GIFT_CARD", merchant: "Amazon", currency: "INR", balanceMinor: 50000 },
    });
    const accountId = (add.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/credits/${accountId}/spend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amountMinor: 10000, idempotencyKey: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    });
    expect(events).toContain("credit_added");
    expect(events).toContain("credit_spent");
  });

  it("emits ingestion_connected / sms_ingested", async () => {
    await grantConsent("EMAIL");
    await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    await grantConsent("SMS");
    await app.inject({
      method: "POST",
      url: "/ingestion/sms",
      headers: { authorization: `Bearer ${token}` },
      payload: { from: "+919999999999", body: "Order shipped" },
    });
    expect(events).toContain("ingestion_connected");
    expect(events).toContain("sms_ingested");
  });

  it("emits vault_export / vault_deleted", async () => {
    await app.inject({
      method: "GET",
      url: "/vault/export",
      headers: { authorization: `Bearer ${token}` },
    });
    await app.inject({
      method: "DELETE",
      url: "/vault",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(events).toContain("vault_export");
    expect(events).toContain("vault_deleted");
  });

  it("emits receipt_uploaded / receipt_confirmed / warranty_created / warranty_claimed", async () => {
    await grantConsent("FINANCIAL");
    const m = buildMultipart(Buffer.from("bytes"));
    const upload = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: { authorization: `Bearer ${token}`, "content-type": m.contentType },
      payload: m.payload,
    });
    const receiptId = (upload.json() as { id: string }).id;

    await app.inject({
      method: "POST",
      url: `/receipts/${receiptId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Mock Mart",
        purchasedAt: new Date().toISOString(),
        totalMinor: 129900,
        currency: "INR",
        items: [{ title: "Cotton T-Shirt", priceMinor: 49900 }],
        warranties: [
          {
            itemIndex: 0,
            coverageUntil: new Date(Date.now() + 90 * 86_400_000).toISOString(),
            claimContact: "support@mockmart.com",
          },
        ],
      },
    });
    const warrantyId = (
      (
        await app.inject({
          method: "GET",
          url: "/warranties",
          headers: { authorization: `Bearer ${token}` },
        })
      ).json() as { warranties: Array<{ id: string }> }
    ).warranties[0]!.id;

    await app.inject({
      method: "POST",
      url: `/warranties/${warrantyId}/claim`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(events).toContain("receipt_uploaded");
    expect(events).toContain("receipt_confirmed");
    expect(events).toContain("warranty_created");
    expect(events).toContain("warranty_claimed");
  });
});
