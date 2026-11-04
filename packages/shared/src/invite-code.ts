/**
 * Invite codes for households and swap circles. A code grants access to members' shared closet
 * and balances, so it comes from the platform CSPRNG (`crypto.getRandomValues`), never
 * `Math.random`.
 */

/** 32 symbols (no I, O, 0, 1): a random byte masked to 5 bits picks one without bias. */
export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function secureInviteCode(length = 8): string {
  const n = Math.max(4, Math.min(16, Math.floor(length)));
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("crypto.getRandomValues is required to generate invite codes");
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(n));
  let out = "";
  for (const byte of bytes) out += INVITE_ALPHABET[byte & 31]!;
  return out;
}
