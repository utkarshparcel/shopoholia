import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { gmailConnectAvailable, oauthStateSecret, signState, verifyState } from "./ingestion.js";

const HTML = { accept: "text/html,application/xhtml+xml" };

describe("Gmail OAuth state and callback", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let repos: ReturnType<typeof createMemoryRepositories>;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    repos = createMemoryRepositories();
    app = await buildServer({ logger: false, deps: { repos } });
    userId = (await repos.createUser("919811110001")).user.id;
    token = app.jwt.sign({ sub: userId, phone: "919811110001" });
    await repos.grantConsent({ userId, scope: "EMAIL", source: "test" });
  });

  afterEach(async () => {
    await app.close();
  });

  async function connect() {
    const res = await app.inject({
      method: "POST",
      url: "/ingestion/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "EMAIL", provider: "gmail" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { source: { id: string }; oauthUrl: string };
    return { sourceId: body.source.id, state: new URL(body.oauthUrl).searchParams.get("state")! };
  }

  const callback = (query: string, headers: Record<string, string> = {}) =>
    app.inject({ method: "GET", url: `/ingestion/sources/oauth/callback?${query}`, headers });

  it("issues a signed state with a nonce that expires in 10 minutes", async () => {
    const before = Date.now();
    const { sourceId, state } = await connect();
    const payload = verifyState(state)!;
    expect(payload).toMatchObject({ v: 2, userId, sourceId, kind: "EMAIL" });
    expect(payload.nonce.length).toBeGreaterThanOrEqual(32);
    expect(payload.exp - before).toBeGreaterThan(9 * 60 * 1000);
    expect(payload.exp - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
    // Signed, not encrypted: the ids are base64url-encoded, not in the URL as plain text.
    expect(state).not.toContain(userId);
  });

  it("works once: a replayed state is refused", async () => {
    const { sourceId, state } = await connect();
    const first = await callback(`code=c1&state=${encodeURIComponent(state)}`);
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ status: "pending", sourceId });
    const replay = await callback(`code=c2&state=${encodeURIComponent(state)}`);
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toMatchObject({ message: "Invalid state" });
  });

  it("refuses a correctly signed state that the server never issued or that expired", async () => {
    const { sourceId } = await connect();
    const forged = signState({ userId, sourceId, kind: "EMAIL", nonce: "never-stored", exp: Date.now() + 60_000 });
    expect((await callback(`code=c&state=${encodeURIComponent(forged)}`)).statusCode).toBe(400);

    const nonce = "stored-but-expired";
    await repos.saveOauthState({ nonce, userId, sourceId, expiresAt: new Date(Date.now() - 1) });
    const expired = signState({ userId, sourceId, kind: "EMAIL", nonce, exp: Date.now() - 1 });
    expect((await callback(`code=c&state=${encodeURIComponent(expired)}`)).statusCode).toBe(400);
  });

  it("binds the nonce to its user and source", async () => {
    const { sourceId, state } = await connect();
    const { nonce, exp } = verifyState(state)!;
    const other = (await repos.createUser("919811110002")).user.id;
    // Same nonce, re-signed for another user: the stored record doesn't match.
    const swapped = signState({ userId: other, sourceId, kind: "EMAIL", nonce, exp });
    expect((await callback(`code=c&state=${encodeURIComponent(swapped)}`)).statusCode).toBe(400);
  });

  it("ends in a page that leads back to the app, not JSON, for a browser", async () => {
    const { sourceId, state } = await connect();
    const ok = await callback(`code=c1&state=${encodeURIComponent(state)}`, HTML);
    expect(ok.statusCode).toBe(202);
    expect(ok.headers["content-type"]).toMatch(/^text\/html/);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(ok.body).toContain(`worn://connect-email?status=connecting&#38;sourceId=${sourceId}`);
    expect(ok.body).not.toMatch(/^\s*\{/);

    const bad = await callback("code=c1&state=garbage", HTML);
    expect(bad.statusCode).toBe(400);
    expect(bad.headers["content-type"]).toMatch(/^text\/html/);
    expect(bad.body).toContain("worn://connect-email?status=failed");
  });

  it("shows a page when the user cancels at Google, and uses up the state", async () => {
    const { state } = await connect();
    const res = await callback(`error=access_denied&state=${encodeURIComponent(state)}`, HTML);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("worn://connect-email?status=cancelled");
    expect((await callback(`code=late&state=${encodeURIComponent(state)}`)).statusCode).toBe(400);
  });

  it("has no fallback secret in production and reports Gmail connect unavailable", async () => {
    expect(oauthStateSecret({ NODE_ENV: "production", JWT_ACCESS_SECRET: "jwt" })).toBeNull();
    expect(oauthStateSecret({ NODE_ENV: "production", OAUTH_STATE_SECRET: "s" })).toBe("s");
    expect(oauthStateSecret({ NODE_ENV: "development" })).toBe("dev-only-change-me");
    expect(gmailConnectAvailable({ NODE_ENV: "production", GOOGLE_CLIENT_ID: "id" })).toBe(false);
    expect(gmailConnectAvailable({ NODE_ENV: "production", GOOGLE_CLIENT_ID: "id", OAUTH_STATE_SECRET: "s" })).toBe(true);

    const saved = { ...process.env };
    process.env.NODE_ENV = "production";
    delete process.env.OAUTH_STATE_SECRET;
    try {
      const res = await app.inject({
        method: "POST",
        url: "/ingestion/sources",
        headers: { authorization: `Bearer ${token}` },
        payload: { kind: "EMAIL", provider: "gmail" },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: "Unavailable", message: "Email connect is unavailable" });
      expect(await repos.listIngestionSources(userId)).toEqual([]);
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.OAUTH_STATE_SECRET === undefined) delete process.env.OAUTH_STATE_SECRET;
      else process.env.OAUTH_STATE_SECRET = saved.OAUTH_STATE_SECRET;
    }
  });
});
