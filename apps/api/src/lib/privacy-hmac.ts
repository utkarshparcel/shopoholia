import { createHash, createHmac } from "node:crypto";

/**
 * Keyed hashes for privacy records. `PRIVACY_HMAC_SECRET` keys them so a subject ref or a poll
 * share token can't be computed from a guessed id. Production refuses to start without it
 * (`assertPrivacySecretConfigured`, called when the vault routes register).
 */

const DEV_SECRET = "worn-dev-privacy-secret";
let warned = false;

function privacySecret(): string {
  const secret = process.env.PRIVACY_HMAC_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PRIVACY_HMAC_SECRET must be set (at least 16 characters) in production");
  }
  if (!warned) {
    warned = true;
    console.warn("PRIVACY_HMAC_SECRET is not set; using the development secret");
  }
  return DEV_SECRET;
}

/** Throws in production when the secret is missing, so the API fails at boot instead of later. */
export function assertPrivacySecretConfigured(): void {
  privacySecret();
}

function hmac(domain: string, value: string): string {
  return createHmac("sha256", privacySecret()).update(`${domain}\u0000${value}`).digest("hex");
}

/** Pseudonymous id kept on consent and audit rows after the user row is erased. */
export function subjectRefFor(userId: string): string {
  return hmac("subject", userId);
}

/** Unguessable share token for a friend poll (base64url, 43 chars). */
export function pollShareToken(pollId: string): string {
  return createHmac("sha256", privacySecret())
    .update(`poll-share\u0000${pollId}`)
    .digest("base64url");
}

/** What `social_polls.token_hash` stores: the token itself never touches the database. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** One vote per voter per poll; the raw device key or IP is not stored. */
export function pollVoterHash(pollId: string, voterKey: string): string {
  return hmac("poll-voter", `${pollId}\u0000${voterKey}`);
}
