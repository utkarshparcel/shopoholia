/**
 * How a store purchase names its Worn account. The app sets these when it starts a purchase, and the
 * verifiers require them (contract: FIX/platform/iap-contract.md, "Account binding").
 */

import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 URL namespace; the name is `worn:user:<userId>`. */
const APP_ACCOUNT_TOKEN_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

function uuidV5(namespace: string, name: string): string {
  const hash = createHash("sha1")
    .update(Buffer.from(namespace.replaceAll("-", ""), "hex"))
    .update(name, "utf8")
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** StoreKit `appAccountToken`: the user id when it is a UUID (lowercased), else a UUID v5 of it. */
export function appAccountTokenForUser(userId: string): string {
  if (UUID_PATTERN.test(userId)) return userId.toLowerCase();
  return uuidV5(APP_ACCOUNT_TOKEN_NAMESPACE, `worn:user:${userId}`);
}

/** Play Billing `obfuscatedAccountId`: lowercase SHA-256 hex of the user id (64 chars, Play's limit). */
export function playAccountIdForUser(userId: string): string {
  return createHash("sha256").update(userId, "utf8").digest("hex");
}
