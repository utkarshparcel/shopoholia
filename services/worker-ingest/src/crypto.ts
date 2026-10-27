import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM encryption for OAUth tokens at rest.
 *
 * The key is derived from `OAUTH_TOKEN_SECRET`. The secret MUST be set in the
 * environment before any token is encrypted or decrypted; if it is missing we
 * throw a clear runtime error (we do NOT read it at module load, so the worker
 * still starts up in environments that never touch tokens).
 *
 * Format v2 (written now): `v2.<key id>.<base64(salt | iv | tag | ciphertext)>`. The key is
 * scrypt(secret, salt) with a random salt per token; the key id names the secret that encrypted it.
 * To rotate, set the new secret as OAUTH_TOKEN_SECRET and keep the old one in
 * OAUTH_TOKEN_SECRET_PREVIOUS (comma-separated) until every token has been re-encrypted.
 * v1 blobs (`base64(iv | tag | ciphertext)`, one fixed salt) still decrypt.
 */

const ALGO = "aes-256-gcm";
const V1_KEY_SALT = "worn-oauth-token-v1";
const V2_PREFIX = "v2";
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
// scrypt is slow on purpose; a worker decrypts the same tokens again and again.
const MAX_CACHED_KEYS = 1000;
const derivedKeys = new Map<string, Buffer>();

/** The secrets that may decrypt, current first. */
function secrets(): [string, ...string[]] {
  const secret = process.env.OAUTH_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "OAUTH_TOKEN_SECRET is not set — required to encrypt/decrypt OAuth tokens at rest",
    );
  }
  const previous = (process.env.OAUTH_TOKEN_SECRET_PREVIOUS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [secret, ...previous];
}

/** Names a secret without revealing it. */
function keyId(secret: string): string {
  return createHash("sha256").update(`worn-oauth-token-key:${secret}`).digest("base64url").slice(0, 8);
}

function deriveKey(secret: string, salt: Buffer | string): Buffer {
  const cacheKey = `${keyId(secret)}:${Buffer.from(salt).toString("base64")}`;
  const cached = derivedKeys.get(cacheKey);
  if (cached) return cached;
  const key = scryptSync(secret, salt, 32);
  if (derivedKeys.size >= MAX_CACHED_KEYS) derivedKeys.delete(derivedKeys.keys().next().value!);
  derivedKeys.set(cacheKey, key);
  return key;
}

function decryptWith(key: Buffer, iv: Buffer, tag: Buffer, enc: Buffer): string {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Encrypts an arbitrary JSON-serializable value into a single string. */
export function encryptToken(plain: unknown): string {
  const [secret] = secrets();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, deriveKey(secret, salt), iv);
  const json = JSON.stringify(plain);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}.${keyId(secret)}.${Buffer.concat([salt, iv, tag, enc]).toString("base64")}`;
}

/** Decrypts a blob produced by `encryptToken` (either version) back into its original value. */
export function decryptToken<T = unknown>(blob: string): T {
  const all = secrets();
  const parts = blob.split(".");
  if (parts.length === 3 && parts[0] === V2_PREFIX) {
    const secret = all.find((s) => keyId(s) === parts[1]);
    if (!secret) throw new Error("OAuth token was encrypted with a key that is not configured");
    const buf = Buffer.from(parts[2]!, "base64");
    const salt = buf.subarray(0, SALT_LENGTH);
    const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = buf.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const enc = buf.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    return JSON.parse(decryptWith(deriveKey(secret, salt), iv, tag, enc)) as T;
  }

  // v1: no key id, so try each configured secret.
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);
  let lastError: unknown;
  for (const secret of all) {
    try {
      return JSON.parse(decryptWith(deriveKey(secret, V1_KEY_SALT), iv, tag, enc)) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
