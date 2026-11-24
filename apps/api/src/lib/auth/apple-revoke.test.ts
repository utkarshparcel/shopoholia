import { generateKeyPairSync } from "node:crypto";
import { decryptToken } from "@worn/shared/token-crypto";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  appleClientSecret,
  appleRevocationConfig,
  appleRevocationConfigProblem,
  encryptedAppleRefreshTokenFor,
  exchangeAppleAuthorizationCode,
  revokeAppleRefreshToken,
  revokeStoredAppleToken,
} from "./apple-revoke.js";
import { appleFetch, appleRevocationEnv, appleSignInKeyPair, readClientSecret } from "./apple-test-support.js";

const log = pino({ level: "silent" });
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

const key = appleSignInKeyPair();
const otherKey = appleSignInKeyPair();
// The key as a one-line env var (literal "\n").
const env = { NODE_ENV: "test", ...appleRevocationEnv(key.pem) } as NodeJS.ProcessEnv;
const config = appleRevocationConfig(env)!;

beforeEach(() => vi.stubEnv("OAUTH_TOKEN_SECRET", "test-oauth-token-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("Apple revocation settings", () => {
  it("reads the key with literal \\n, and the client id from the bundle id or the first audience", () => {
    expect(config).toMatchObject({ clientId: "app.worncloset.play", teamId: "TEAM123456", keyId: "KEY1234567" });
    const fromAudience = appleRevocationConfig({
      ...env,
      APPLE_BUNDLE_ID: "",
      APPLE_SIGN_IN_AUDIENCES: "app.one, app.two",
    });
    expect(fromAudience?.clientId).toBe("app.one");
  });

  it("is off when a setting is missing or the key is not an EC key", () => {
    for (const name of ["APPLE_TEAM_ID", "APPLE_SIGN_IN_KEY_ID", "APPLE_SIGN_IN_PRIVATE_KEY", "APPLE_BUNDLE_ID"]) {
      expect(appleRevocationConfig({ ...env, [name]: "" }), name).toBeNull();
    }
    expect(appleRevocationConfig({ ...env, APPLE_SIGN_IN_PRIVATE_KEY: "not a key" })).toBeNull();
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" });
    expect(appleRevocationConfig({ ...env, APPLE_SIGN_IN_PRIVATE_KEY: rsa.toString() })).toBeNull();
  });

  it("names what is missing for the boot check", () => {
    expect(appleRevocationConfigProblem({ ...env, OAUTH_TOKEN_SECRET: "s" })).toBeNull();
    expect(appleRevocationConfigProblem({ NODE_ENV: "production" })).toBeNull();
    expect(appleRevocationConfigProblem({ ...env, APPLE_TEAM_ID: "", OAUTH_TOKEN_SECRET: "s" })).toMatch(
      /APPLE_SIGN_IN_KEY_ID, APPLE_TEAM_ID or APPLE_SIGN_IN_PRIVATE_KEY is not set/,
    );
    expect(appleRevocationConfigProblem({ ...env, APPLE_SIGN_IN_PRIVATE_KEY: "x", OAUTH_TOKEN_SECRET: "s" })).toMatch(
      /not a \.p8/,
    );
    expect(appleRevocationConfigProblem({ ...env, OAUTH_TOKEN_SECRET: "" })).toMatch(/OAUTH_TOKEN_SECRET/);
  });
});

describe("appleClientSecret", () => {
  it("is an ES256 JWT for Apple, signed with the Sign in with Apple key", () => {
    const secret = appleClientSecret(config, NOW);
    const read = readClientSecret(secret, key.publicKey);
    expect(read.valid).toBe(true);
    expect(readClientSecret(secret, otherKey.publicKey).valid).toBe(false);
    expect(read.header).toEqual({ alg: "ES256", kid: "KEY1234567" });
    const iat = NOW / 1000;
    expect(read.claims).toEqual({
      iss: "TEAM123456",
      iat,
      exp: expect.any(Number),
      aud: "https://appleid.apple.com",
      sub: "app.worncloset.play",
    });
    expect(read.claims.exp as number).toBeGreaterThan(iat);
    expect((read.claims.exp as number) - iat).toBeLessThanOrEqual(15_777_000);
  });
});

describe("Apple token endpoints", () => {
  it("exchanges the authorization code for the refresh token", async () => {
    const apple = appleFetch({
      [APPLE_TOKEN_URL]: () => Response.json({ access_token: "a", refresh_token: "r-1", id_token: "i" }),
    });
    await expect(
      exchangeAppleAuthorizationCode("code-1", config, { fetchImpl: apple.fetchImpl, now: () => NOW }),
    ).resolves.toBe("r-1");
    const { form } = apple.calls[0]!;
    expect(form).toMatchObject({ client_id: "app.worncloset.play", code: "code-1", grant_type: "authorization_code" });
    expect(readClientSecret(form.client_secret!, key.publicKey).valid).toBe(true);
  });

  it("throws when Apple refuses the code", async () => {
    const apple = appleFetch({ [APPLE_TOKEN_URL]: () => Response.json({ error: "invalid_grant" }, { status: 400 }) });
    await expect(exchangeAppleAuthorizationCode("used", config, { fetchImpl: apple.fetchImpl })).rejects.toThrow(
      /400 invalid_grant/,
    );
  });

  it("revokes the refresh token; an already invalid token counts as done, anything else throws", async () => {
    const ok = appleFetch({ [APPLE_REVOKE_URL]: () => new Response("", { status: 200 }) });
    await revokeAppleRefreshToken("r-1", config, { fetchImpl: ok.fetchImpl });
    expect(ok.calls[0]!.form).toMatchObject({
      client_id: "app.worncloset.play",
      token: "r-1",
      token_type_hint: "refresh_token",
    });
    expect(readClientSecret(ok.calls[0]!.form.client_secret!, key.publicKey).valid).toBe(true);

    const gone = appleFetch({ [APPLE_REVOKE_URL]: () => Response.json({ error: "invalid_grant" }, { status: 400 }) });
    await expect(revokeAppleRefreshToken("r-1", config, { fetchImpl: gone.fetchImpl })).resolves.toBeUndefined();
    const down = appleFetch({ [APPLE_REVOKE_URL]: () => new Response("", { status: 503 }) });
    await expect(revokeAppleRefreshToken("r-1", config, { fetchImpl: down.fetchImpl })).rejects.toThrow(/503/);
    const badClient = appleFetch({
      [APPLE_REVOKE_URL]: () => Response.json({ error: "invalid_client" }, { status: 400 }),
    });
    await expect(revokeAppleRefreshToken("r-1", config, { fetchImpl: badClient.fetchImpl })).rejects.toThrow(
      /invalid_client/,
    );
  });
});

describe("sign-in exchange and erase revoke (best effort)", () => {
  it("returns the refresh token encrypted", async () => {
    const apple = appleFetch({ [APPLE_TOKEN_URL]: () => Response.json({ refresh_token: "r-2" }) });
    const blob = await encryptedAppleRefreshTokenFor("code-2", { env, fetchImpl: apple.fetchImpl, log });
    expect(blob).toBeTruthy();
    expect(blob).not.toContain("r-2");
    expect(decryptToken(blob!)).toBe("r-2");
  });

  it("returns null without throwing when the exchange fails", async () => {
    const network = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(encryptedAppleRefreshTokenFor("code-3", { env, fetchImpl: network, log })).resolves.toBeNull();
    const refused = appleFetch({ [APPLE_TOKEN_URL]: () => new Response("", { status: 500 }) });
    await expect(
      encryptedAppleRefreshTokenFor("code-3", { env, fetchImpl: refused.fetchImpl, log }),
    ).resolves.toBeNull();
  });

  it("calls nothing without a code or without the revocation key", async () => {
    const apple = appleFetch({});
    await expect(encryptedAppleRefreshTokenFor(null, { env, fetchImpl: apple.fetchImpl, log })).resolves.toBeNull();
    const unconfigured = { ...env, APPLE_SIGN_IN_PRIVATE_KEY: "" };
    await expect(
      encryptedAppleRefreshTokenFor("code-4", { env: unconfigured, fetchImpl: apple.fetchImpl, log }),
    ).resolves.toBeNull();
    const blob = (await encryptedAppleRefreshTokenFor("code-5", {
      env,
      fetchImpl: appleFetch({ [APPLE_TOKEN_URL]: () => Response.json({ refresh_token: "r" }) }).fetchImpl,
      log,
    }))!;
    await expect(revokeStoredAppleToken(blob, { env: unconfigured, fetchImpl: apple.fetchImpl, log })).resolves.toBe(
      "unconfigured",
    );
    expect(apple.calls).toEqual([]);
  });

  it("reports a stored token it can't read, and a failed revoke, without throwing", async () => {
    const apple = appleFetch({ [APPLE_REVOKE_URL]: () => new Response("", { status: 502 }) });
    await expect(revokeStoredAppleToken("garbage", { env, fetchImpl: apple.fetchImpl, log })).resolves.toBe(
      "undecryptable",
    );
    expect(apple.calls).toEqual([]);
    const blob = (await encryptedAppleRefreshTokenFor("code-6", {
      env,
      fetchImpl: appleFetch({ [APPLE_TOKEN_URL]: () => Response.json({ refresh_token: "r-6" }) }).fetchImpl,
      log,
    }))!;
    await expect(revokeStoredAppleToken(blob, { env, fetchImpl: apple.fetchImpl, log })).resolves.toBe("failed");
    expect(apple.calls[0]!.form.token).toBe("r-6");
  });
});
