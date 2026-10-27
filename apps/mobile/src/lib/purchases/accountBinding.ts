import { CryptoDigestAlgorithm, digest, digestStringAsync } from 'expo-crypto';

/**
 * How a store purchase is tied to the Worn account that paid, so the server can check it
 * (iap-contract.md, section 2). The server computes the same values from the token's `sub`.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 URL namespace, for user ids that aren't UUIDs. */
export const ACCOUNT_TOKEN_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** RFC 4122 version 5 (SHA-1, name-based) UUID. */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const ns = hexToBytes(namespace.replace(/-/g, ''));
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(ns.length + nameBytes.length);
  data.set(ns);
  data.set(nameBytes, ns.length);
  const bytes = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA1, data)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * StoreKit 2 `appAccountToken`: the Worn user id, lowercased. Worn ids are UUIDs; any other id
 * becomes the UUID v5 of `worn:user:<id>`.
 */
export async function appAccountTokenFor(userId: string): Promise<string> {
  if (UUID_PATTERN.test(userId)) return userId.toLowerCase();
  return uuidV5(`worn:user:${userId}`, ACCOUNT_TOKEN_NAMESPACE);
}

/** Play Billing `obfuscatedAccountId`: the SHA-256 hex of the Worn user id (64 characters, Play's limit). */
export async function obfuscatedAccountIdFor(userId: string): Promise<string> {
  return (await digestStringAsync(CryptoDigestAlgorithm.SHA256, userId)).toLowerCase();
}
