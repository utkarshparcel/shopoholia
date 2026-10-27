import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
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

  it("writes v2 blobs: a key id and a random KDF salt per token", () => {
    const enc1 = encryptToken({ a: 1 });
    const enc2 = encryptToken({ a: 1 });
    const [v, kid, body] = enc1.split(".");
    expect(v).toBe("v2");
    expect(kid).toHaveLength(8);
    expect(enc2.split(".")[1]).toBe(kid);
    expect(enc1).not.toContain(SECRET);
    // salt | iv | tag | ciphertext: the first 16 bytes (the salt) differ between tokens.
    const salt = (blob: string) => Buffer.from(blob.split(".")[2]!, "base64").subarray(0, 16).toString("hex");
    expect(salt(enc1)).not.toBe(salt(enc2));
    expect(Buffer.from(body!, "base64").length).toBeGreaterThan(16 + 12 + 16);
  });

  it("still decrypts v1 tokens (fixed salt, no key id)", () => {
    const key = scryptSync(SECRET, "worn-oauth-token-v1", 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify({ refreshToken: "old" }), "utf8"), cipher.final()]);
    const v1 = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
    expect(decryptToken(v1)).toEqual({ refreshToken: "old" });
  });

  it("rotates: tokens from the previous secret decrypt, new ones use the current secret", () => {
    const old = encryptToken({ a: "old" });
    process.env.OAUTH_TOKEN_SECRET = "a-brand-new-secret-at-least-32-bytes-long";
    expect(() => decryptToken(old)).toThrow(/not configured/);
    process.env.OAUTH_TOKEN_SECRET_PREVIOUS = SECRET;
    try {
      expect(decryptToken(old)).toEqual({ a: "old" });
      const fresh = encryptToken({ a: "new" });
      expect(fresh.split(".")[1]).not.toBe(old.split(".")[1]);
      expect(decryptToken(fresh)).toEqual({ a: "new" });
    } finally {
      delete process.env.OAUTH_TOKEN_SECRET_PREVIOUS;
    }
  });

  it("rejects a tampered token", () => {
    const enc = encryptToken({ a: 1 });
    const [v, kid, body] = enc.split(".");
    const bytes = Buffer.from(body!, "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptToken(`${v}.${kid}.${bytes.toString("base64")}`)).toThrow();
  });

  it("throws a clear error when OAUTH_TOKEN_SECRET is unset", () => {
    delete process.env.OAUTH_TOKEN_SECRET;
    expect(() => encryptToken({ a: 1 })).toThrow(/OAUTH_TOKEN_SECRET/);
    expect(() => decryptToken("anything")).toThrow(/OAUTH_TOKEN_SECRET/);
  });
});
