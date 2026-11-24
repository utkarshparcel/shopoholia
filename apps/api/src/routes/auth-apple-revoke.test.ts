import { decryptToken } from "@worn/shared/token-crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";
import { privacyErase } from "../jobs/privacy-erase.js";
import { APPLE_KEYS_URL, resetAppleKeyCacheForTests } from "../lib/auth/apple.js";
import { APPLE_REVOKE_URL, APPLE_TOKEN_URL } from "../lib/auth/apple-revoke.js";
import {
  appleFetch,
  appleIdentityKey,
  appleIdentityToken,
  appleRevocationEnv,
  appleSignInKeyPair,
  readClientSecret,
} from "../lib/auth/apple-test-support.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { createMockStorage } from "../lib/storage/r2.js";

// Sign in with Apple token revocation end to end (App Store requirement): POST /auth/apple trades
// the authorization code for a refresh token and stores it encrypted; DELETE /vault revokes it.
// Apple is faked through the global fetch; nothing leaves the machine.

const BUNDLE_ID = "app.worncloset.play";
const NONCE = "raw-nonce-0123456789abcdef";
const identityKey = appleIdentityKey();
const signInKey = appleSignInKeyPair();

type Answer = () => Response | Promise<Response>;

describe("Sign in with Apple token revocation", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let repos: ReturnType<typeof createMemoryRepositories>;
  let apple: ReturnType<typeof appleFetch>;
  let tokenAnswer: Answer;
  let revokeAnswer: Answer;

  beforeEach(async () => {
    resetAppleKeyCacheForTests();
    vi.stubEnv("OAUTH_TOKEN_SECRET", "test-oauth-token-secret");
    vi.stubEnv("APPLE_SIGN_IN_AUDIENCES", "");
    for (const [name, value] of Object.entries(appleRevocationEnv(signInKey.pem, BUNDLE_ID))) {
      vi.stubEnv(name, value);
    }
    tokenAnswer = () => Response.json({ access_token: "a", refresh_token: "apple-refresh-1", id_token: "i" });
    revokeAnswer = () => new Response("", { status: 200 });
    apple = appleFetch({
      [APPLE_KEYS_URL]: () => Response.json({ keys: [identityKey.jwk] }),
      [APPLE_TOKEN_URL]: () => tokenAnswer(),
      [APPLE_REVOKE_URL]: () => revokeAnswer(),
    });
    vi.stubGlobal("fetch", apple.fetchImpl);
    repos = createMemoryRepositories();
    app = await buildServer({ logger: false, deps: { repos, storage: createMockStorage() } });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const appleCalls = (url: string) => apple.calls.filter((c) => c.url === url);

  async function signIn(sub: string, extra: Record<string, unknown> = { authorizationCode: "auth-code-1" }) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/apple",
      payload: {
        identityToken: appleIdentityToken(identityKey, { aud: BUNDLE_ID, sub, rawNonce: NONCE }),
        nonce: NONCE,
        ...extra,
      },
    });
    expect(res.statusCode).toBe(200);
    const accessToken = res.json().accessToken as string;
    return { accessToken, userId: (app.jwt.verify(accessToken) as { sub: string }).sub };
  }

  async function deleteAccount(accessToken: string) {
    const res = await app.inject({ method: "DELETE", url: "/vault", headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(202);
    return res.json() as { id: string; status: string };
  }

  it("exchanges the authorization code at sign-in and stores the refresh token encrypted", async () => {
    const { userId } = await signIn("001.sub-store");
    const [exchange] = appleCalls(APPLE_TOKEN_URL);
    expect(exchange?.form).toMatchObject({ client_id: BUNDLE_ID, code: "auth-code-1", grant_type: "authorization_code" });
    expect(readClientSecret(exchange!.form.client_secret!, signInKey.publicKey).valid).toBe(true);

    const stored = await repos.getAppleRefreshToken(userId);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("apple-refresh-1");
    expect(decryptToken(stored!)).toBe("apple-refresh-1");
    // Never part of the user record (responses, exports).
    expect(JSON.stringify(await repos.findUserById(userId))).not.toContain(stored!);
  });

  it("still signs in when the exchange fails, and stores nothing", async () => {
    tokenAnswer = () => Response.json({ error: "invalid_grant" }, { status: 400 });
    const refused = await signIn("001.sub-refused");
    expect(await repos.getAppleRefreshToken(refused.userId)).toBeNull();

    tokenAnswer = () => {
      throw new TypeError("fetch failed");
    };
    const offline = await signIn("001.sub-offline");
    expect(await repos.getAppleRefreshToken(offline.userId)).toBeNull();
    expect(appleCalls(APPLE_TOKEN_URL)).toHaveLength(2);
  });

  it("revokes the stored token at Apple before the account is erased", async () => {
    const { accessToken, userId } = await signIn("001.sub-erase");
    const request = await deleteAccount(accessToken);
    expect(request.status).toBe("DONE");

    const [revoke] = appleCalls(APPLE_REVOKE_URL);
    expect(revoke?.form).toEqual({
      client_id: BUNDLE_ID,
      client_secret: expect.any(String),
      token: "apple-refresh-1",
      token_type_hint: "refresh_token",
    });
    const secret = readClientSecret(revoke!.form.client_secret!, signInKey.publicKey);
    expect(secret).toMatchObject({
      valid: true,
      header: { alg: "ES256", kid: "KEY1234567" },
      claims: { iss: "TEAM123456", aud: "https://appleid.apple.com", sub: BUNDLE_ID },
    });
    expect(readClientSecret(revoke!.form.client_secret!, appleSignInKeyPair().publicKey).valid).toBe(false);

    expect(await repos.findUserById(userId)).toBeNull();
    expect(await repos.getAppleRefreshToken(userId)).toBeNull();
    const done = await repos.getPrivacyRequest(request.id);
    expect(done?.steps).toMatchObject({ appleTokenRevoke: "revoked", rowsDeleted: true });
    expect(done?.steps).not.toHaveProperty("appleTokenPending");
  });

  it("erases the account when the revoke fails, and the privacy-erase retry revokes it later", async () => {
    const { accessToken, userId } = await signIn("001.sub-revoke-down");
    revokeAnswer = () => new Response("", { status: 503 });
    const request = await deleteAccount(accessToken);

    // The account is gone even though Apple was down.
    expect(await repos.findUserById(userId)).toBeNull();
    expect(appleCalls(APPLE_REVOKE_URL)).toHaveLength(1);
    const open = await repos.getPrivacyRequest(request.id);
    expect(open?.status).not.toBe("DONE");
    expect(open?.steps).toMatchObject({ appleTokenRevoke: "pending", rowsDeleted: true });
    expect(decryptToken(open!.steps.appleTokenPending as string)).toBe("apple-refresh-1");

    // The queued retry (the privacy-erase job) revokes it and finishes the request.
    revokeAnswer = () => new Response("", { status: 200 });
    await privacyErase({ requestId: request.id }, { repos, storage: createMockStorage(), log: app.log });
    const revokes = appleCalls(APPLE_REVOKE_URL);
    expect(revokes).toHaveLength(2);
    expect(revokes[1]!.form.token).toBe("apple-refresh-1");
    const done = await repos.getPrivacyRequest(request.id);
    expect(done).toMatchObject({ status: "DONE", userId: null });
    expect(done?.steps).toMatchObject({ appleTokenRevoke: "revoked" });
    expect(done?.steps).not.toHaveProperty("appleTokenPending");
  });

  it("calls nothing at Apple for an account signed in without a code (older app builds)", async () => {
    const { accessToken, userId } = await signIn("001.sub-no-code", {});
    expect(appleCalls(APPLE_TOKEN_URL)).toEqual([]);
    const request = await deleteAccount(accessToken);
    expect(request.status).toBe("DONE");
    expect(await repos.findUserById(userId)).toBeNull();
    expect(appleCalls(APPLE_REVOKE_URL)).toEqual([]);
  });

  it("without the revocation key, neither exchanges nor revokes", async () => {
    vi.stubEnv("APPLE_SIGN_IN_PRIVATE_KEY", "");
    const { accessToken, userId } = await signIn("001.sub-unconfigured");
    expect(await repos.getAppleRefreshToken(userId)).toBeNull();
    const request = await deleteAccount(accessToken);
    expect(request.status).toBe("DONE");
    expect(appleCalls(APPLE_TOKEN_URL)).toEqual([]);
    expect(appleCalls(APPLE_REVOKE_URL)).toEqual([]);
  });

  it("with a token stored but the key removed since, erases without calling Apple", async () => {
    const { accessToken, userId } = await signIn("001.sub-key-removed");
    expect(await repos.getAppleRefreshToken(userId)).toBeTruthy();
    vi.stubEnv("APPLE_TEAM_ID", "");
    const request = await deleteAccount(accessToken);
    expect(request.status).toBe("DONE");
    expect(appleCalls(APPLE_REVOKE_URL)).toEqual([]);
    expect((await repos.getPrivacyRequest(request.id))?.steps).toMatchObject({ appleTokenRevoke: "unconfigured" });
  });
});
