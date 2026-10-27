import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto.js";

const SECRET = "test-secret-at-least-32-bytes-long-1234567890";

describe("crypto (AES-256-GCM token encryption)", () => {
  const prev = process.env.OAUTH_TOKEN_SECRET;

  beforeEach(() => {
    process.env.OAUTH_TOKEN_SECRET = SECRET;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.OAUTH_TOKEN_SECRET;
    else process.env.OAUTH_TOKEN_SECRET = prev;
  });

  it("round-trips an arbitrary object and never stores plaintext", () => {
    const token = {
      accessToken: "abc",
      refreshToken: "def",
      expiresAt: 1700000000000,
      scope: "x",
    };
    const enc = encryptToken(token);
    expect(enc).not.toContain("abc");
    expect(enc).not.toContain("def");
    expect(decryptToken(enc)).toEqual(token);
  });

  it("uses a random IV so ciphertexts differ but decrypt identically", () => {
    const enc1 = encryptToken({ a: 1 });
    const enc2 = encryptToken({ a: 1 });
    expect(enc1).not.toEqual(enc2);
    expect(decryptToken(enc1)).toEqual(decryptToken(enc2));
  });

  it("throws a clear error when OAUTH_TOKEN_SECRET is unset", () => {
    delete process.env.OAUTH_TOKEN_SECRET;
    expect(() => encryptToken({ a: 1 })).toThrow(/OAUTH_TOKEN_SECRET/);
    expect(() => decryptToken("anything")).toThrow(/OAUTH_TOKEN_SECRET/);
  });
});
