/**
 * INGEST-GMAIL-E2E — recorded-fixture harness (no live Gmail).
 *
 * Proves the worker inbox path against captured Gmail API JSON:
 *   OAuth tokens → listSince (bootstrap messages.list | history.list)
 *   → candidate filter → parser → IngestPersister (≥1 merchant_purchases).
 *
 * Also covers: expired-token refresh, history 404 → list resync, consent refuse,
 * missing tokens, missing message get, empty/legacy history shapes, mute filter,
 * processResync with real GmailConnector + fixtures, list non-OK graceful empty.
 *
 * Live Google inbox / restricted-scope verification remains OPEN — see
 * docs/UNIVERSE_QA_REPORT.md appendix B4. Do not treat this suite as [x].
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "../crypto.js";
import {
  GmailConnector,
  MERCHANT_QUERY,
  createMemoryTokenStore,
} from "../connectors/gmail.js";
import { ConsentRequiredError } from "../connectors/types.js";
import { processIngestJob, processResync } from "../index.js";
import type { IngestPersister } from "../persistence.js";
import type { ParsedPurchase } from "../parsers/types.js";
import { ingestionSources, type Db } from "@worn/db";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "gmail-recorded",
);

const OAUTH_SECRET = "secret-32-bytes-long-abcdefghijklmnop";

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as T;
}

type FetchCall = { url: string; init?: RequestInit };

function createRecordingFetch(opts?: {
  /** Force history.list status (404 triggers messages.list fallback). */
  historyStatus?: number;
  /** Which history fixture to serve (default incremental). */
  historyFixture?:
    | "history-incremental.json"
    | "history-empty.json"
    | "history-legacy-messages.json";
  /** Force messages.list non-OK. */
  listStatus?: number;
  /** Message ids that should 404 on messages.get. */
  missingMessageIds?: readonly string[];
  /** Override token endpoint response / status. */
  tokenResponse?: Record<string, unknown>;
  tokenStatus?: number;
  /** Capture every request for assertions. */
  calls?: FetchCall[];
}): typeof fetch {
  const profile = loadJson<Record<string, unknown>>("profile.json");
  const list = loadJson<Record<string, unknown>>("messages-list.json");
  const history = loadJson<Record<string, unknown>>(
    opts?.historyFixture ?? "history-incremental.json",
  );
  const byId: Record<string, Record<string, unknown>> = {
    "msg-amazon-fixture-1": loadJson("message-amazon.json"),
    "msg-flipkart-fixture-1": loadJson("message-flipkart.json"),
    "msg-promo-fixture-1": loadJson("message-promo.json"),
  };
  const missing = new Set(opts?.missingMessageIds ?? []);

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    opts?.calls?.push({ url, init });

    if (url.includes("oauth2.googleapis.com/token")) {
      const status = opts?.tokenStatus ?? 200;
      if (status !== 200) {
        return {
          ok: false,
          status,
          json: async () => ({ error: "invalid_grant" }),
        } as never;
      }
      return {
        ok: true,
        json: async () =>
          opts?.tokenResponse ?? {
            access_token: "fixture-at-refreshed",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/gmail.readonly",
            refresh_token: "fixture-rt",
          },
      } as never;
    }
    if (url.includes("/users/me/profile")) {
      return { ok: true, json: async () => profile } as never;
    }
    if (url.includes("/users/me/history")) {
      const status = opts?.historyStatus ?? 200;
      if (status !== 200) {
        return {
          ok: false,
          status,
          json: async () => ({ error: { code: status } }),
        } as never;
      }
      return { ok: true, status: 200, json: async () => history } as never;
    }
    if (url.includes("/users/me/messages?") || /\/messages\?/.test(url)) {
      const status = opts?.listStatus ?? 200;
      if (status !== 200) {
        return {
          ok: false,
          status,
          json: async () => ({ error: { code: status } }),
        } as never;
      }
      return { ok: true, json: async () => list } as never;
    }
    const msgMatch = url.match(/\/messages\/([^/?]+)/);
    if (msgMatch) {
      const id = decodeURIComponent(msgMatch[1]!);
      if (missing.has(id)) {
        return { ok: false, status: 404, json: async () => ({}) } as never;
      }
      const message = byId[id];
      if (message) return { ok: true, json: async () => message } as never;
      return { ok: false, status: 404, json: async () => ({}) } as never;
    }
    return { ok: false, status: 404, json: async () => ({}) } as never;
  }) as unknown as typeof fetch;
}

function seedTokens(
  store: ReturnType<typeof createMemoryTokenStore>,
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }> = {},
) {
  return store.save(
    encryptToken({
      accessToken: overrides.accessToken ?? "fixture-at",
      refreshToken: overrides.refreshToken ?? "fixture-rt",
      expiresAt: overrides.expiresAt ?? Date.now() + 3_600_000,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    }),
  );
}

function makeConnector(
  store: ReturnType<typeof createMemoryTokenStore>,
  fetchImpl: typeof fetch,
) {
  return new GmailConnector({
    clientId: "fixture-client",
    clientSecret: "fixture-secret",
    redirectUri: "https://api.shopoholia.app/ingestion/sources/oauth/callback",
    sourceId: "src-fixture-1",
    tokenStore: store,
    fetchImpl,
  });
}

function memoryPersister() {
  const purchases: ParsedPurchase[] = [];
  const docs: Array<{ id: string; status: string; purchaseId?: string }> = [];
  const cursors: Array<{ sourceId: string; cursor: string }> = [];
  const persister: IngestPersister = {
    async insertPurchase(purchase) {
      purchases.push(purchase);
      return `purchase-${purchases.length}`;
    },
    async markDocument(documentId, status, matchedPurchaseId) {
      docs.push({ id: documentId, status, purchaseId: matchedPurchaseId });
    },
    async updateSourceCursor(sourceId, cursor) {
      cursors.push({ sourceId, cursor });
    },
  };
  return { persister, purchases, docs, cursors };
}

async function runPipeline(
  messages: Awaited<ReturnType<GmailConnector["listSince"]>>["messages"],
  persister: IngestPersister,
  extras?: { mutedMerchants?: readonly string[] },
) {
  const results = [];
  for (const msg of messages) {
    results.push(
      await processIngestJob(msg, {
        persister,
        sourceKind: "EMAIL",
        sourceId: "src-fixture-1",
        documentId: `doc-${msg.messageId}`,
        userId: "00000000-0000-0000-0000-000000000001",
        mutedMerchants: extras?.mutedMerchants,
      }),
    );
  }
  return results;
}

function fakeDb(sourceRow: unknown, grantRow: unknown) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () =>
            table === ingestionSources ? [sourceRow] : [grantRow],
          ),
        })),
      })),
    })),
  } as unknown as Db;
}

describe("INGEST-GMAIL-E2E recorded fixture inbox path", () => {
  it("bootstrap listSince → parse → persists Amazon + Flipkart (filters promo)", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(store, createRecordingFetch({ calls }));

    const { messages, nextCursor } = await connector.listSince(null, {
      id: "grant-fixture",
      revokedAt: null,
    });

    // Promo is in messages.list but not a candidate → only merchant orders
    expect(messages.map((m) => m.messageId).sort()).toEqual([
      "msg-amazon-fixture-1",
      "msg-flipkart-fixture-1",
    ]);
    expect(nextCursor).toBe("9001"); // profile historyId
    expect(calls.some((c) => c.url.includes("/users/me/profile"))).toBe(true);
    const listCall = calls.find((c) => c.url.includes("/users/me/messages?"));
    expect(listCall).toBeTruthy();
    // URLSearchParams may use + for spaces; assert merchant q is present
    expect(listCall!.url).toMatch(/[?&]q=/);
    expect(listCall!.url).toMatch(/from(%3A|:)amazon/i);
    expect(MERCHANT_QUERY).toContain("from:amazon");

    const { persister, purchases, docs, cursors } = memoryPersister();
    const results = await runPipeline(messages, persister);

    expect(results.every((r) => r.matched && r.purchaseId)).toBe(true);
    expect(purchases).toHaveLength(2);

    const amazon = purchases.find((p) => p.merchant === "AMAZON");
    const flipkart = purchases.find((p) => p.merchant === "FLIPKART");
    expect(amazon).toMatchObject({
      currency: "INR",
      totalMinor: 129_900,
      orderRef: "AMZ-4029-1188",
    });
    expect(flipkart).toMatchObject({
      currency: "INR",
      totalMinor: 84_900,
      orderRef: "FK-77120934",
    });

    expect(docs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "doc-msg-amazon-fixture-1",
          status: "MATCHED",
        }),
        expect.objectContaining({
          id: "doc-msg-flipkart-fixture-1",
          status: "MATCHED",
        }),
      ]),
    );
    expect(cursors.map((c) => c.cursor).sort()).toEqual([
      "msg-amazon-fixture-1",
      "msg-flipkart-fixture-1",
    ]);
  });

  it("incremental history.list (messagesAdded) → parse → ≥1 purchase", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(store, createRecordingFetch({ calls }));

    const { messages, nextCursor } = await connector.listSince("8000", {
      id: "grant-fixture",
      revokedAt: null,
    });

    expect(calls.some((c) => c.url.includes("startHistoryId=8000"))).toBe(true);
    expect(calls.some((c) => c.url.includes("historyTypes=messageAdded"))).toBe(
      true,
    );
    expect(messages).toHaveLength(2);
    expect(nextCursor).toBe("9100");

    const { persister, purchases } = memoryPersister();
    await runPipeline(messages, persister);

    expect(purchases.length).toBeGreaterThanOrEqual(1);
    expect(purchases.map((p) => p.merchant).sort()).toEqual([
      "AMAZON",
      "FLIPKART",
    ]);
  });

  it("expired access token refreshes before Gmail read, then persists", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    await seedTokens(store, {
      accessToken: "fixture-at-stale",
      expiresAt: Date.now() - 120_000,
    });
    const connector = makeConnector(
      store,
      createRecordingFetch({
        calls,
        tokenResponse: {
          access_token: "fixture-at-fresh",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.readonly",
        },
      }),
    );

    const { messages } = await connector.listSince(null, {
      id: "grant-fixture",
      revokedAt: null,
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);

    const tokenCall = calls.find((c) =>
      c.url.includes("oauth2.googleapis.com/token"),
    );
    expect(tokenCall).toBeTruthy();
    expect(String(tokenCall!.init?.body)).toContain("grant_type=refresh_token");
    expect(String(tokenCall!.init?.body)).toContain("refresh_token=fixture-rt");

    const persisted = decryptToken<{ accessToken: string }>(store.last()!);
    expect(persisted.accessToken).toBe("fixture-at-fresh");

    const gmailAuth = calls.find(
      (c) =>
        c.url.includes("gmail.googleapis.com") &&
        c.init?.headers &&
        String(
          (c.init.headers as Record<string, string>).Authorization ?? "",
        ).includes("fixture-at-fresh"),
    );
    expect(gmailAuth).toBeTruthy();

    const { persister, purchases } = memoryPersister();
    await runPipeline(messages, persister);
    expect(purchases.length).toBeGreaterThanOrEqual(1);
  });

  it("history 404 falls back to messages.list bootstrap and still inserts", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(
      store,
      createRecordingFetch({ calls, historyStatus: 404 }),
    );

    const { messages, nextCursor } = await connector.listSince("stale-hist", {
      id: "grant-fixture",
      revokedAt: null,
    });

    expect(calls.some((c) => c.url.includes("/users/me/history"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/users/me/messages?"))).toBe(true);
    expect(messages.map((m) => m.messageId)).toContain("msg-amazon-fixture-1");
    expect(nextCursor).toBeTruthy();

    const { persister, purchases } = memoryPersister();
    await runPipeline(messages, persister);
    expect(purchases.some((p) => p.merchant === "AMAZON")).toBe(true);
  });

  it("revoked consent refuses listSince (no Gmail reads)", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(store, createRecordingFetch({ calls }));

    await expect(
      connector.listSince(null, {
        id: "grant-revoked",
        revokedAt: new Date("2025-01-01T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);

    expect(calls).toHaveLength(0);
  });

  it("missing stored tokens refuse sync before any Gmail HTTP", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    const connector = makeConnector(store, createRecordingFetch({ calls }));

    await expect(
      connector.listSince(null, { id: "grant-fixture", revokedAt: null }),
    ).rejects.toThrow(/No stored Gmail tokens/i);
    expect(calls).toHaveLength(0);
  });

  it("messages.get 404 skips that id; sibling Amazon still persists", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(
      store,
      createRecordingFetch({
        calls,
        missingMessageIds: ["msg-flipkart-fixture-1"],
      }),
    );

    const { messages } = await connector.listSince(null, {
      id: "grant-fixture",
      revokedAt: null,
    });

    expect(messages.map((m) => m.messageId)).toEqual(["msg-amazon-fixture-1"]);
    const { persister, purchases } = memoryPersister();
    await runPipeline(messages, persister);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]!.merchant).toBe("AMAZON");
  });

  it("empty history.list advances cursor with zero purchases", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(
      store,
      createRecordingFetch({ historyFixture: "history-empty.json" }),
    );

    const { messages, nextCursor } = await connector.listSince("8000", {
      id: "grant-fixture",
      revokedAt: null,
    });

    expect(messages).toHaveLength(0);
    expect(nextCursor).toBe("9200");
    const { persister, purchases } = memoryPersister();
    await runPipeline(messages, persister);
    expect(purchases).toHaveLength(0);
  });

  it("legacy history[].messages shape normalizes and persists", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(
      store,
      createRecordingFetch({ historyFixture: "history-legacy-messages.json" }),
    );

    const { messages, nextCursor } = await connector.listSince("8000", {
      id: "grant-fixture",
      revokedAt: null,
    });

    expect(nextCursor).toBe("9300");
    expect(messages.map((m) => m.messageId).sort()).toEqual([
      "msg-amazon-fixture-1",
      "msg-flipkart-fixture-1",
    ]);
    const { persister, purchases } = memoryPersister();
    await runPipeline(messages, persister);
    expect(purchases).toHaveLength(2);
  });

  it("muted AMAZON in fixture pipeline skips insert; Flipkart still MATCHED", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(store, createRecordingFetch());

    const { messages } = await connector.listSince(null, {
      id: "grant-fixture",
      revokedAt: null,
    });
    const { persister, purchases, docs } = memoryPersister();
    const results = await runPipeline(messages, persister, {
      mutedMerchants: ["AMAZON"],
    });

    expect(results.some((r) => r.skippedMuted)).toBe(true);
    expect(purchases.map((p) => p.merchant)).toEqual(["FLIPKART"]);
    expect(docs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "doc-msg-amazon-fixture-1",
          status: "UNMATCHED",
        }),
        expect.objectContaining({
          id: "doc-msg-flipkart-fixture-1",
          status: "MATCHED",
        }),
      ]),
    );
  });

  it("processResync with GmailConnector + fixtures inserts ≥1 and advances cursor", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const fetchImpl = createRecordingFetch();
    const { persister, purchases, cursors } = memoryPersister();

    const seen = await processResync("src-fixture-1", {
      db: fakeDb(
        {
          id: "src-fixture-1",
          consentGrantId: "grant-fixture",
          provider: "gmail",
          cursor: null,
          encryptedToken: store.last(),
          meta: {},
        },
        { id: "grant-fixture", revokedAt: null },
      ),
      persister,
      connectorFactory: () => makeConnector(store, fetchImpl),
    });

    expect(seen).toBeGreaterThanOrEqual(1);
    expect(purchases.length).toBeGreaterThanOrEqual(1);
    expect(cursors.some((c) => c.sourceId === "src-fixture-1")).toBe(true);
  });

  it("refresh token non-OK keeps stale AT and still bootstraps when Gmail accepts it", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const calls: FetchCall[] = [];
    const store = createMemoryTokenStore();
    await seedTokens(store, {
      accessToken: "fixture-at-stale-ok",
      expiresAt: Date.now() - 120_000,
    });
    const connector = makeConnector(
      store,
      createRecordingFetch({ calls, tokenStatus: 400 }),
    );

    const { messages } = await connector.listSince(null, {
      id: "grant-fixture",
      revokedAt: null,
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);

    const tokenCall = calls.find((c) =>
      c.url.includes("oauth2.googleapis.com/token"),
    );
    expect(tokenCall).toBeTruthy();
    const gmailAuth = calls.find(
      (c) =>
        c.url.includes("gmail.googleapis.com") &&
        String(
          ((c.init?.headers ?? {}) as Record<string, string>).Authorization ??
            "",
        ).includes("fixture-at-stale-ok"),
    );
    expect(gmailAuth).toBeTruthy();
  });

  it("messages.list non-OK on bootstrap yields empty (no throw)", async () => {
    process.env.OAUTH_TOKEN_SECRET = OAUTH_SECRET;
    const store = createMemoryTokenStore();
    await seedTokens(store);
    const connector = makeConnector(
      store,
      createRecordingFetch({ listStatus: 503 }),
    );

    const { messages, nextCursor } = await connector.listSince(null, {
      id: "grant-fixture",
      revokedAt: null,
    });
    expect(messages).toHaveLength(0);
    expect(nextCursor).toBe("9001"); // profile historyId still captured
  });
});
