import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM encryption for OAUth tokens at rest.
 *
 * The key is derived from `OAUTH_TOKEN_SECRET`. The secret MUST be set in the
 * environment before any token is encrypted or decrypted; if it is missing we
 * throw a clear runtime error (we do NOT read it at module load, so the worker
 * still starts up in environments that never touch tokens).
 */

const ALGO = "aes-256-gcm";
const KEY_SALT = "worn-oauth-token-v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const secret = process.env.OAUTH_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "OAUTH_TOKEN_SECRET is not set — required to encrypt/decrypt OAuth tokens at rest",
    );
  }
  return scryptSync(secret, KEY_SALT, 32);
}

/** Encrypts an arbitrary JSON-serializable value into a single base64 blob. */
export function encryptToken(plain: unknown): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(plain);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decrypts a blob produced by `encryptToken` back into its original value. */
export function decryptToken<T = unknown>(blob: string): T {
  const key = deriveKey();
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  return JSON.parse(json) as T;
}
