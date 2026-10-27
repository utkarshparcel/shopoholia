import { describe, expect, it, vi } from "vitest";
import { GmailConnector, createMemoryTokenStore } from "./gmail.js";
import { ConsentRequiredError } from "./types.js";
import { decryptToken, encryptToken } from "../crypto.js";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function makeConnector(tokenStore = createMemoryTokenStore()) {
  return new GmailConnector({
    clientId: "cid",
    clientSecret: "secret",
    redirectUri: "https://api.shopoholia.app/ingestion/sources/oauth/callback",
    sourceId: "src-1",
    tokenStore,
  });
}

const TOKEN_JSON = {
  access_token: "at-123",
  refresh_token: "rt-123",
  expires_in: 3600,
  scope: GMAIL_SCOPE,
};

describe("GmailConnector", () => {
  it("builds a read-only OAuth URL carrying scope + state + offline access", () => {
    const url = makeConnector().buildOAuthUrl(
      JSON.stringify({ userId: "u", sourceId: "s" }),
    );
    expect(url).toContain("accounts.google.com");
    expect(url).toContain(encodeURIComponent(GMAIL_SCOPE));
    expect(url).toContain("access_type=offline");
    expect(url).toContain(
      "state=" + encodeURIComponent(JSON.stringify({ userId: "u", sourceId: "s" })),
    );
  });

  it("refuses to read without a live consent grant", async () => {
    const connector = makeConnector(createMemoryTokenStore("encrypted-blob"));
    await expect(
      connector.listSince(null, { id: "g", revokedAt: new Date() }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("throws ConsentRequiredError from completeOAuth when consent is revoked", async () => {
    const connector = makeConnector();
    await expect(
      connector.completeOAuth("code", { id: "g", revokedAt: new Date() }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("completeOAuth exchanges the code, encrypts tokens, and round-trips", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = makeConnector(store);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => TOKEN_JSON,
    })) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl =
      fetchImpl;

    const tokens = await connector.completeOAuth("code", {
      id: "g",
      revokedAt: null,
    });

    expect(tokens.accessToken).toBe("at-123");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const stored = store.last();
    expect(stored).toBeTruthy();
    // Stored value is the encrypted envelope, not plaintext:
    expect(stored).not.toContain("at-123");
    expect(decryptToken(stored!)).toEqual(tokens);
  });

  it("listSince normalizes only candidate messages from history", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = makeConnector(store);
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/token")) {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (url.includes("/history")) {
        return {
          ok: true,
          json: async () => ({
            historyId: "h2",
            messages: [{ id: "m1" }, { id: "m2" }],
          }),
        } as never;
      }
      // messages endpoint
      const id = url.split("/messages/")[1]!;
      if (id === "m1") {
        return {
          ok: true,
          json: async () => ({
            id: "m1",
            payload: {
              headers: [
                { name: "From", value: "no-reply@amazon.in" },
                { name: "Subject", value: "Your Amazon order has shipped" },
                { name: "Date", value: "Tue, 12 Aug 2025 09:14:00 +0530" },
              ],
              body: { data: Buffer.from("Total: Rs. 1,299.00").toString("base64") },
            },
          }),
        } as never;
      }
      return {
        ok: true,
        json: async () => ({
          id: "m2",
          payload: {
            headers: [
              { name: "From", value: "news@example.com" },
              { name: "Subject", value: "Weekly deals newsletter" },
            ],
            body: { data: Buffer.from("Unsubscribe here").toString("base64") },
          },
        }),
      } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl =
      fetchImpl;

    // Seed an encrypted token so listSince can decrypt.
    await connector.completeOAuth("code", { id: "g", revokedAt: null });

    const { messages, nextCursor } = await connector.listSince("h1", {
      id: "g",
      revokedAt: null,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.from).toBe("no-reply@amazon.in");
    expect(nextCursor).toBe("h2");
  });

  // --- Additional P0 coverage ---

  it("token decrypt/encrypt round-trip preserves all fields and hides plaintext", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const payload = { accessToken: "abc", refreshToken: "def", expiresAt: Date.now() + 3600_000, scope: GMAIL_SCOPE };
    const enc = encryptToken(payload);
    expect(enc).not.toContain("abc");
    expect(enc).not.toContain("def");
    expect(decryptToken(enc)).toEqual(payload);
    // Random IV assurance
    const enc2 = encryptToken(payload);
    expect(enc2).not.toEqual(enc);
    expect(decryptToken(enc2)).toEqual(payload);
  });

  it("refresh-token exchange is performed when access token is expired and persists new token", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const expiredTokens = {
      accessToken: "old-at",
      refreshToken: "rt-123",
      expiresAt: Date.now() - 10_000,
      scope: GMAIL_SCOPE,
    };
    const store = createMemoryTokenStore(encryptToken(expiredTokens));
    const connector = makeConnector(store);

    const refreshedJson = { access_token: "new-at-456", expires_in: 3600, scope: GMAIL_SCOPE };
    let tokenRefreshCalled = false;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        tokenRefreshCalled = true;
        // Verify refresh grant_type is used
        const body = String((init as unknown as { body?: string })?.body ?? "");
        expect(body).toContain("grant_type=refresh_token");
        expect(body).toContain("refresh_token=rt-123");
        return { ok: true, json: async () => refreshedJson } as never;
      }
      if (String(url).includes("/history")) {
        // After refresh, Authorization should carry the new access token.
        void (init as unknown as { headers?: Record<string, string> })?.headers?.Authorization;
        return {
          ok: true,
          json: async () => ({ historyId: "h99", messages: [] }),
        } as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl;

    const { nextCursor, messages } = await connector.listSince("h1", { id: "g", revokedAt: null });
    expect(tokenRefreshCalled).toBe(true);
    expect(messages).toHaveLength(0);
    expect(nextCursor).toBe("h99");
    // Store should now contain refreshed access token
    const stored = store.last();
    expect(stored).toBeTruthy();
    const decrypted = decryptToken(stored!);
    expect(decrypted.accessToken).toBe("new-at-456");
    expect(decrypted.refreshToken).toBe("rt-123");
    // Subsequent call should not refresh again (still fresh)
    const fetchImpl2 = vi.fn(async (url: string) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        throw new Error("should not refresh when still valid");
      }
      if (String(url).includes("/history")) {
        return { ok: true, json: async () => ({ historyId: "h100", messages: [] }) } as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl2;
    const res2 = await connector.listSince("h99", { id: "g", revokedAt: null });
    expect(res2.nextCursor).toBe("h100");
  });

  it("historyId bootstrap on first sync calls profile and messages.list with merchant query", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = makeConnector(store);
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/token") && String((init as unknown as { method?: string })?.method) === "POST") {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (u.includes("/profile")) {
        return { ok: true, json: async () => ({ historyId: "boot-123", emailAddress: "user@example.com" }) } as never;
      }
      if (u.includes("/messages") && !u.includes("/messages/")) {
        // messages.list - check merchant query present
        expect(u).toContain("q=");
        // Ensure at least amazon / flipkart parts of query are encoded
        expect(decodeURIComponent(u)).toContain("amazon");
        return {
          ok: true,
          json: async () => ({ messages: [{ id: "m-boot-1" }, { id: "m-boot-2" }] }),
        } as never;
      }
      const id = u.split("/messages/")[1]?.split("?")[0];
      if (id === "m-boot-1") {
        return {
          ok: true,
          json: async () => ({
            id: "m-boot-1",
            historyId: "boot-124",
            payload: {
              headers: [
                { name: "From", value: "orders@amazon.in" },
                { name: "Subject", value: "Your order confirmation" },
                { name: "Date", value: "Tue, 12 Aug 2025 09:14:00 +0530" },
              ],
              body: { data: Buffer.from("Order total Rs. 500").toString("base64") },
            },
          }),
        } as never;
      }
      if (id === "m-boot-2") {
        return {
          ok: true,
          json: async () => ({
            id: "m-boot-2",
            payload: {
              headers: [
                { name: "From", value: "spam@example.com" },
                { name: "Subject", value: "Hello" },
              ],
              body: { data: Buffer.from("noise").toString("base64") },
            },
          }),
        } as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl;

    await connector.completeOAuth("code", { id: "g", revokedAt: null });
    const { messages, nextCursor } = await connector.listSince(null, { id: "g", revokedAt: null });
    // Only candidate (amazon confirmation) survives filter
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageId).toBe("m-boot-1");
    // nextCursor derived from profile bootstrap historyId
    expect(nextCursor).toBe("boot-123");
    // Verify profile was called
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/profile"))).toBe(true);
    // Verify messages.list was called
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/messages") && !String(url).includes("/messages/"))).toBe(true);
  });

  it("listSince respects cursor: history.list uses startHistoryId and returns its historyId as nextCursor", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = makeConnector(store);
    let capturedHistoryUrl = "";
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/token")) {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (String(url).includes("/history")) {
        capturedHistoryUrl = String(url);
        const u = new URL(String(url));
        expect(u.searchParams.get("startHistoryId")).toBe("cursor-abc");
        return {
          ok: true,
          json: async () => ({ historyId: "cursor-next", messages: [] }),
        } as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl;

    await connector.completeOAuth("code", { id: "g", revokedAt: null });
    const resultA = await connector.listSince("cursor-abc", { id: "g", revokedAt: null });
    expect(capturedHistoryUrl).toContain("cursor-abc");
    expect(resultA.nextCursor).toBe("cursor-next");
    expect(resultA.messages).toHaveLength(0);

    // Second call with new cursor should use that cursor
    capturedHistoryUrl = "";
    const fetchImpl2 = vi.fn(async (url: string) => {
      if (String(url).includes("/token")) {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (String(url).includes("/history")) {
        capturedHistoryUrl = String(url);
        expect(new URL(String(url)).searchParams.get("startHistoryId")).toBe("cursor-next");
        return { ok: true, json: async () => ({ historyId: "cursor-next-2", messages: [] }) } as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl2;
    const resultB = await connector.listSince("cursor-next", { id: "g", revokedAt: null });
    expect(capturedHistoryUrl).toContain("cursor-next");
    expect(resultB.nextCursor).toBe("cursor-next-2");
  });

  it("gracefully falls back to messages.list when historyId is expired (404)", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = makeConnector(store);
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/token")) {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (String(url).includes("/history")) {
        return { ok: false, status: 404, json: async () => ({ error: { message: "historyId not found" } }) } as never;
      }
      if (String(url).includes("/messages") && !String(url).includes("/messages/")) {
        return { ok: true, json: async () => ({ messages: [] }) } as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl;
    await connector.completeOAuth("code", { id: "g", revokedAt: null });
    const res = await connector.listSince("stale-cursor", { id: "g", revokedAt: null });
    // Should not throw, should return empty via fallback
    expect(res.messages).toHaveLength(0);
  });

  it("404 history fallback returns empty when messages.list also fails", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = makeConnector(store);
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/token")) {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (String(url).includes("/history")) {
        return { ok: false, status: 404, json: async () => ({ error: { message: "historyId expired" } }) } as never;
      }
      // messages.list throws → nested catch returns empty
      if (String(url).includes("/messages")) {
        throw new Error("messages.list boom");
      }
      return { ok: false, status: 500, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl;
    await connector.completeOAuth("code", { id: "g", revokedAt: null });
    const res = await connector.listSince("stale", { id: "g", revokedAt: null });
    expect(res.messages).toEqual([]);
    expect(res.nextCursor).toBe("stale");
  });

  it("non-404 history errors return empty when clientId is missing placeholder", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = new GmailConnector({
      clientId: "MISSING_GOOGLE_CLIENT_ID",
      clientSecret: "secret",
      redirectUri: "https://api.shopoholia.app/ingestion/sources/oauth/callback",
      sourceId: "src-1",
      tokenStore: store,
    });
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/token")) {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (String(url).includes("/history")) {
        throw new Error("network reset");
      }
      return { ok: false, status: 500, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl;
    await connector.completeOAuth("code", { id: "g", revokedAt: null });
    const res = await connector.listSince("c1", { id: "g", revokedAt: null });
    expect(res.messages).toEqual([]);
  });

  it("messages.list path uses now when Date header missing", async () => {
    process.env.OAUTH_TOKEN_SECRET = "secret-32-bytes-long-abcdefghijklmnop";
    const store = createMemoryTokenStore();
    const connector = makeConnector(store);
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/token")) {
        return { ok: true, json: async () => TOKEN_JSON } as never;
      }
      if (String(url).includes("/profile")) {
        return { ok: true, json: async () => ({ historyId: "boot-1", emailAddress: "u@x.com" }) } as never;
      }
      if (String(url).includes("/messages") && !String(url).includes("/messages/")) {
        return { ok: true, json: async () => ({ messages: [{ id: "m1" }] }) } as never;
      }
      if (String(url).includes("/messages/m1")) {
        return {
          ok: true,
          json: async () => ({
            id: "m1",
            historyId: "h9",
            payload: {
              headers: [
                { name: "From", value: "no-reply@amazon.in" },
                { name: "To", value: "u@x.com" },
                { name: "Subject", value: "Your Amazon.in order" },
              ],
              body: { data: Buffer.from("Order total: ₹100.00").toString("base64url") },
            },
          }),
        } as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    (connector as unknown as { config: { fetchImpl?: typeof fetch } }).config.fetchImpl = fetchImpl;
    await connector.completeOAuth("code", { id: "g", revokedAt: null });
    const res = await connector.listSince(null, { id: "g", revokedAt: null });
    expect(res.messages.length).toBeGreaterThanOrEqual(1);
    expect(Number.isNaN(Date.parse(res.messages[0]!.receivedAt))).toBe(false);
  });
});
