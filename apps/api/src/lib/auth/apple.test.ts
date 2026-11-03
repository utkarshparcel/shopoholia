import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  APPLE_ISSUER,
  APPLE_KEYS_URL,
  AppleVerifyUnavailableError,
  hashAppleNonce,
  resetAppleKeyCacheForTests,
  verifyAppleIdentityToken,
  verifyTestAppleToken,
} from "./apple.js";

const BUNDLE_ID = "app.worncloset.play";
const NONCE = "raw-nonce-0123456789abcdef";
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const env = { NODE_ENV: "production", APPLE_BUNDLE_ID: BUNDLE_ID } as NodeJS.ProcessEnv;

function keyPair(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, kty: "RSA", alg: "RS256", use: "sig" } };
}

const appleKey = keyPair("apple-1");
const rotatedKey = keyPair("apple-2");
const strangerKey = keyPair("apple-1");

function token(
  claims: Record<string, unknown>,
  { privateKey = appleKey.privateKey, kid = appleKey.kid, alg = "RS256" }: { privateKey?: KeyObject; kid?: string; alg?: string } = {},
) {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = `${b64({ alg, kid })}.${b64({
    iss: APPLE_ISSUER,
    aud: BUNDLE_ID,
    sub: "001234.abcdef",
    iat: NOW / 1000 - 10,
    exp: NOW / 1000 + 600,
    nonce: hashAppleNonce(NONCE),
    email: "Shopper@Example.com",
    email_verified: "true",
    ...claims,
  })}`;
  return `${head}.${sign("RSA-SHA256", Buffer.from(head), privateKey).toString("base64url")}`;
}

function keysFetch(keys: object[]) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ keys }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("verifyAppleIdentityToken", () => {
  beforeEach(() => resetAppleKeyCacheForTests());

  const verify = (t: string, fetchImpl: typeof fetch, nonce = NONCE, now = NOW) =>
    verifyAppleIdentityToken(t, nonce, { fetchImpl, env, now: () => now });

  it("accepts a token Apple signed for this app and this sign-in", async () => {
    const { calls, fetchImpl } = keysFetch([appleKey.jwk]);
    expect(await verify(token({}), fetchImpl)).toEqual({
      sub: "001234.abcdef",
      email: "shopper@example.com",
      isPrivateEmail: false,
      aud: BUNDLE_ID,
    });
    expect(calls).toEqual([APPLE_KEYS_URL]);
    // The keys are cached.
    await verify(token({}), fetchImpl);
    expect(calls).toHaveLength(1);
  });

  it("keeps a private relay address and a missing email as they are", async () => {
    const { fetchImpl } = keysFetch([appleKey.jwk]);
    const relay = await verify(
      token({ email: "x1@privaterelay.appleid.com", is_private_email: "true" }),
      fetchImpl,
    );
    expect(relay).toMatchObject({ email: "x1@privaterelay.appleid.com", isPrivateEmail: true });
    expect(await verify(token({ email: undefined }), fetchImpl)).toMatchObject({ email: null });
  });

  it.each([
    ["another app", { aud: "com.other.app" }],
    ["another issuer", { iss: "https://accounts.google.com" }],
    ["an expired token", { exp: NOW / 1000 - 120 }],
    ["a token from the future", { iat: NOW / 1000 + 3600 }],
    ["another sign-in's nonce", { nonce: hashAppleNonce("someone-elses-nonce-0000") }],
    ["no nonce", { nonce: undefined }],
    ["no subject", { sub: undefined }],
  ])("refuses %s", async (_label, claims) => {
    const { fetchImpl } = keysFetch([appleKey.jwk]);
    expect(await verify(token(claims), fetchImpl)).toBeNull();
  });

  it("refuses a token signed by anyone but Apple, or not RS256", async () => {
    const { fetchImpl } = keysFetch([appleKey.jwk]);
    expect(await verify(token({}, { privateKey: strangerKey.privateKey }), fetchImpl)).toBeNull();
    expect(await verify(token({}, { alg: "none" }), fetchImpl)).toBeNull();
    expect(await verify("not-a-jwt", fetchImpl)).toBeNull();
  });

  it("refetches the keys for a key id it hasn't seen (Apple rotated them)", async () => {
    let keys: object[] = [appleKey.jwk];
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ keys }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await verify(token({}), fetchImpl)).not.toBeNull();
    keys = [appleKey.jwk, rotatedKey.jwk];
    const later = NOW + 5 * 60_000;
    const rotated = token(
      { iat: later / 1000, exp: later / 1000 + 600 },
      { privateKey: rotatedKey.privateKey, kid: rotatedKey.kid },
    );
    expect(await verify(rotated, fetchImpl, NONCE, later)).not.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("says Apple is unavailable when the keys can't be fetched", async () => {
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(verify(token({}), down)).rejects.toBeInstanceOf(AppleVerifyUnavailableError);
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(verify(token({}), offline)).rejects.toBeInstanceOf(AppleVerifyUnavailableError);
  });

  it("refuses everything when no audience is configured outside tests", async () => {
    const { fetchImpl } = keysFetch([appleKey.jwk]);
    expect(
      await verifyAppleIdentityToken(token({}), NONCE, { fetchImpl, env: { NODE_ENV: "production" }, now: () => NOW }),
    ).toBeNull();
  });

  it("prefers APPLE_SIGN_IN_AUDIENCES over APPLE_BUNDLE_ID", async () => {
    const { fetchImpl } = keysFetch([appleKey.jwk]);
    const audEnv = { ...env, APPLE_SIGN_IN_AUDIENCES: "com.other.app, app.worncloset.dev" };
    expect(
      await verifyAppleIdentityToken(token({}), NONCE, { fetchImpl, env: audEnv, now: () => NOW }),
    ).toBeNull();
    expect(
      await verifyAppleIdentityToken(token({ aud: "app.worncloset.dev" }), NONCE, {
        fetchImpl,
        env: audEnv,
        now: () => NOW,
      }),
    ).toMatchObject({ aud: "app.worncloset.dev" });
  });
});

describe("verifyTestAppleToken", () => {
  it("parses test tokens and checks their nonce", () => {
    expect(verifyTestAppleToken("test-apple:sub-1:Me@Example.com:n", "n")).toEqual({
      sub: "sub-1",
      email: "me@example.com",
      isPrivateEmail: false,
      aud: "test-bundle",
    });
    expect(verifyTestAppleToken("test-apple:sub-1:-:n", "n")).toMatchObject({ email: null });
    expect(verifyTestAppleToken("test-apple:sub-1:me@example.com:n", "other")).toBeNull();
    expect(verifyTestAppleToken("eyJhbGciOiJSUzI1NiJ9.e30.sig", "n")).toBeNull();
  });
});
