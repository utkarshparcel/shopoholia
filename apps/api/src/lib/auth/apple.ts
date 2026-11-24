import { createHash, createPublicKey, verify as verifySignature, type JsonWebKey, type KeyObject } from "node:crypto";

/**
 * Sign in with Apple (App Store Guideline 4.8). The app sends the credential's identity token, a
 * JWT Apple signs with one of the keys at APPLE_KEYS_URL. It is checked here, locally: signature
 * (RS256), issuer, audience (the app's bundle id), expiry, and the nonce the app made for this
 * sign-in (the token carries its SHA-256, the app sends the raw value).
 */

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

const FETCH_TIMEOUT_MS = 5_000;
/** Apple rotates keys rarely; an unknown `kid` refetches, at most this often. */
const KEYS_REFETCH_MIN_MS = 60_000;
const KEYS_TTL_MS = 24 * 60 * 60_000;
/** Clock skew allowed on `exp` / `iat`. */
const SKEW_SECONDS = 60;

export type AppleIdentity = {
  sub: string;
  /** Null when the user shared no email. May be a private relay address. */
  email: string | null;
  isPrivateEmail: boolean;
  aud: string;
};

/** Apple's keys couldn't be fetched (timeout, network error or a 5xx), so the token wasn't checked. */
export class AppleVerifyUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Sign in with Apple could not be verified right now", { cause });
  }
}

/** Audiences a token may be for: APPLE_SIGN_IN_AUDIENCES (comma-separated), else APPLE_BUNDLE_ID. */
export function appleSignInAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.APPLE_SIGN_IN_AUDIENCES?.trim() || env.APPLE_BUNDLE_ID?.trim() || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The nonce the app gives Apple: SHA-256 of the raw nonce, lowercase hex. */
export function hashAppleNonce(rawNonce: string): string {
  return createHash("sha256").update(rawNonce, "utf8").digest("hex");
}

type Jwk = JsonWebKey & { kid?: string; kty?: string; alg?: string };

type KeyCache = { keys: Map<string, KeyObject>; fetchedAt: number };
let cache: KeyCache | null = null;

/** Tests only. */
export function resetAppleKeyCacheForTests(): void {
  cache = null;
}

async function fetchKeys(fetchImpl: typeof fetch): Promise<Map<string, KeyObject>> {
  let res: Response;
  try {
    res = await fetchImpl(APPLE_KEYS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new AppleVerifyUnavailableError(error);
  }
  if (!res.ok) throw new AppleVerifyUnavailableError(`apple keys ${res.status}`);
  let body: { keys?: Jwk[] };
  try {
    body = (await res.json()) as { keys?: Jwk[] };
  } catch (error) {
    throw new AppleVerifyUnavailableError(error);
  }
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    try {
      keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
    } catch {
      // A key this runtime can't read is skipped; the others still work.
    }
  }
  return keys;
}

async function keyFor(kid: string, fetchImpl: typeof fetch, nowMs: number): Promise<KeyObject | null> {
  const fresh = cache && nowMs - cache.fetchedAt < KEYS_TTL_MS;
  const cached = fresh ? cache!.keys.get(kid) : undefined;
  if (cached) return cached;
  if (cache && fresh && nowMs - cache.fetchedAt < KEYS_REFETCH_MIN_MS) return null;
  cache = { keys: await fetchKeys(fetchImpl), fetchedAt: nowMs };
  return cache.keys.get(kid) ?? null;
}

function decodePart<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

type AppleClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
};

const truthy = (v: unknown) => v === true || v === "true";

/**
 * The identity behind an Apple identity token, or null when the token is not valid for this app
 * and this sign-in. Throws AppleVerifyUnavailableError when Apple's keys can't be fetched.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce: string,
  opts: { fetchImpl?: typeof fetch; now?: () => number; env?: NodeJS.ProcessEnv } = {},
): Promise<AppleIdentity | null> {
  const env = opts.env ?? process.env;
  const audiences = appleSignInAudiences(env);
  if (audiences.length === 0) {
    return env.NODE_ENV === "test" ? verifyTestAppleToken(identityToken, rawNonce) : null;
  }
  const nowMs = (opts.now ?? Date.now)();

  const parts = identityToken.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodePart<{ alg?: string; kid?: string }>(headerPart);
  const claims = decodePart<AppleClaims>(payloadPart);
  if (!header || !claims || header.alg !== "RS256" || !header.kid) return null;

  const key = await keyFor(header.kid, opts.fetchImpl ?? fetch, nowMs);
  if (!key) return null;
  const signed = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    key,
    Buffer.from(signaturePart, "base64url"),
  );
  if (!signed) return null;

  if (claims.iss !== APPLE_ISSUER || !claims.sub) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  const matched = aud.find((a) => audiences.includes(a));
  if (!matched) return null;
  const nowSeconds = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== "number" || claims.exp + SKEW_SECONDS < nowSeconds) return null;
  if (typeof claims.iat === "number" && claims.iat - SKEW_SECONDS > nowSeconds) return null;
  // The app always sends a nonce, so a token without one (or for another sign-in) is refused.
  if (!claims.nonce || claims.nonce !== hashAppleNonce(rawNonce)) return null;

  const email = claims.email && truthy(claims.email_verified ?? true) ? claims.email.toLowerCase() : null;
  return { sub: claims.sub, email, isPrivateEmail: truthy(claims.is_private_email), aud: matched };
}

/** Deterministic fake tokens for tests (NODE_ENV=test, no audience set): `test-apple:<sub>:<email>:<nonce>`. */
export function verifyTestAppleToken(identityToken: string, rawNonce: string): AppleIdentity | null {
  if (!identityToken.startsWith("test-apple:")) return null;
  const [, sub, email, nonce] = identityToken.split(":");
  if (!sub || nonce !== rawNonce) return null;
  return {
    sub,
    email: email && email !== "-" ? email.toLowerCase() : null,
    isPrivateEmail: Boolean(email?.endsWith("@privaterelay.appleid.com")),
    aud: "test-bundle",
  };
}
