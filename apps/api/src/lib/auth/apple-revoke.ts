import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { decryptToken, encryptToken } from "@worn/shared/token-crypto";
import { captureException } from "../sentry.js";
import { APPLE_ISSUER, appleSignInAudiences } from "./apple.js";

/**
 * Sign in with Apple token revocation (App Store requirement for apps that offer Sign in with
 * Apple: deleting the account revokes the user's Apple tokens).
 *
 * At sign-in the app's one-time authorization code is exchanged at APPLE_TOKEN_URL for a refresh
 * token, which is stored encrypted (users.apple_refresh_token_enc, OAUTH_TOKEN_SECRET). Account
 * deletion revokes it at APPLE_REVOKE_URL. Both calls authenticate with a client secret: an ES256
 * JWT signed with the Sign in with Apple key (APPLE_SIGN_IN_KEY_ID, APPLE_TEAM_ID,
 * APPLE_SIGN_IN_PRIVATE_KEY). Without that key nothing is exchanged or revoked.
 */

export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

/** Short: sign-in waits for the exchange, and erasure for the revoke. */
const APPLE_TIMEOUT_MS = 5_000;
/** Apple allows at most 15777000 s (6 months); each secret is used once, right away. */
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

export type AppleRevocationConfig = {
  /** The app's bundle id: APPLE_BUNDLE_ID, else the first APPLE_SIGN_IN_AUDIENCES entry. */
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: KeyObject;
};

type Log = {
  warn: (obj: object, msg: string) => void;
  info?: (obj: object, msg: string) => void;
};

function rawRevocationSettings(env: NodeJS.ProcessEnv) {
  return {
    keyId: env.APPLE_SIGN_IN_KEY_ID?.trim() ?? "",
    teamId: env.APPLE_TEAM_ID?.trim() ?? "",
    pem: (env.APPLE_SIGN_IN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim(),
    clientId: env.APPLE_BUNDLE_ID?.trim() || appleSignInAudiences(env)[0] || "",
  };
}

function parseKey(pem: string): KeyObject | null {
  try {
    const key = createPrivateKey(pem);
    return key.asymmetricKeyType === "ec" ? key : null;
  } catch {
    return null;
  }
}

/** The revocation settings, or null when any is missing or the key isn't an EC private key. */
export function appleRevocationConfig(env: NodeJS.ProcessEnv = process.env): AppleRevocationConfig | null {
  const { keyId, teamId, pem, clientId } = rawRevocationSettings(env);
  if (!keyId || !teamId || !pem || !clientId) return null;
  const privateKey = parseKey(pem);
  return privateKey ? { clientId, teamId, keyId, privateKey } : null;
}

/** For bootConfigProblems: why tokens won't be revoked, or null when they will (or Apple is off). */
export function appleRevocationConfigProblem(env: NodeJS.ProcessEnv): string | null {
  if (!env.APPLE_BUNDLE_ID?.trim()) return null;
  const { keyId, teamId, pem } = rawRevocationSettings(env);
  if (!keyId || !teamId || !pem) {
    return "APPLE_SIGN_IN_KEY_ID, APPLE_TEAM_ID or APPLE_SIGN_IN_PRIVATE_KEY is not set: Apple tokens are not revoked when an account is deleted (App Store requirement)";
  }
  if (!parseKey(pem)) {
    return "APPLE_SIGN_IN_PRIVATE_KEY is not a .p8 (EC) private key: Apple tokens are not revoked when an account is deleted (App Store requirement)";
  }
  if (!env.OAUTH_TOKEN_SECRET) {
    return "OAUTH_TOKEN_SECRET is not set: Apple refresh tokens can't be stored, so they are not revoked when an account is deleted (App Store requirement)";
  }
  return null;
}

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

/** The client_secret for Apple's token endpoints: an ES256 JWT signed with the Sign in with Apple key. */
export function appleClientSecret(config: AppleRevocationConfig, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const input = `${b64url({ alg: "ES256", kid: config.keyId })}.${b64url({
    iss: config.teamId,
    iat,
    exp: iat + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_ISSUER,
    sub: config.clientId,
  })}`;
  // JWS wants the raw r||s signature, not DER.
  const signature = sign("sha256", Buffer.from(input), { key: config.privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

type CallOpts = { fetchImpl?: typeof fetch; now?: () => number };

async function postForm(url: string, form: Record<string, string>, fetchImpl: typeof fetch) {
  return fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
  });
}

async function appleError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "";
}

/** Trades an authorization code for a refresh token (null when Apple returned none). Throws on failure. */
export async function exchangeAppleAuthorizationCode(
  code: string,
  config: AppleRevocationConfig,
  opts: CallOpts = {},
): Promise<string | null> {
  const res = await postForm(
    APPLE_TOKEN_URL,
    {
      client_id: config.clientId,
      client_secret: appleClientSecret(config, (opts.now ?? Date.now)()),
      code,
      grant_type: "authorization_code",
    },
    opts.fetchImpl ?? globalThis.fetch,
  );
  if (!res.ok) throw new Error(`apple token exchange: ${res.status} ${await appleError(res)}`.trim());
  const body = (await res.json()) as { refresh_token?: unknown };
  return typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null;
}

/**
 * Revokes a refresh token (and the access tokens minted from it). Throws on failure. Apple answers
 * 400 `invalid_grant` for a token that is already revoked or expired, which counts as done.
 */
export async function revokeAppleRefreshToken(
  refreshToken: string,
  config: AppleRevocationConfig,
  opts: CallOpts = {},
): Promise<void> {
  const res = await postForm(
    APPLE_REVOKE_URL,
    {
      client_id: config.clientId,
      client_secret: appleClientSecret(config, (opts.now ?? Date.now)()),
      token: refreshToken,
      token_type_hint: "refresh_token",
    },
    opts.fetchImpl ?? globalThis.fetch,
  );
  if (res.ok) return;
  const error = await appleError(res);
  if (res.status === 400 && error === "invalid_grant") return;
  throw new Error(`apple token revoke: ${res.status} ${error}`.trim());
}

/**
 * Sign-in: the encrypted refresh token for this authorization code, or null (no code, no
 * revocation key, or the exchange failed). Never throws: a failed exchange is logged and reported,
 * and sign-in goes on.
 */
export async function encryptedAppleRefreshTokenFor(
  authorizationCode: string | null | undefined,
  opts: CallOpts & { env?: NodeJS.ProcessEnv; log: Log },
): Promise<string | null> {
  if (!authorizationCode) return null;
  const config = appleRevocationConfig(opts.env);
  if (!config) return null;
  try {
    const refreshToken = await exchangeAppleAuthorizationCode(authorizationCode, config, opts);
    if (!refreshToken) {
      opts.log.warn({}, "apple.token_exchange.no_refresh_token");
      return null;
    }
    return encryptToken(refreshToken);
  } catch (err) {
    opts.log.warn({ err }, "apple.token_exchange.failed");
    captureException(err, { tags: { apple: "token_exchange" } });
    return null;
  }
}

/**
 * Account deletion: revokes a stored (encrypted) refresh token.
 * - "revoked": Apple confirmed (or the token was already invalid).
 * - "unconfigured": no revocation key here, so nothing was sent.
 * - "undecryptable": the blob can't be read with OAUTH_TOKEN_SECRET (retrying won't help).
 * - "failed": Apple or the network failed; worth retrying.
 * Never throws; failures are logged and reported.
 */
export async function revokeStoredAppleToken(
  encrypted: string,
  opts: CallOpts & { env?: NodeJS.ProcessEnv; log: Log },
): Promise<"revoked" | "unconfigured" | "undecryptable" | "failed"> {
  const config = appleRevocationConfig(opts.env);
  if (!config) {
    opts.log.warn({}, "apple.token_revoke.unconfigured");
    return "unconfigured";
  }
  let refreshToken: string;
  try {
    refreshToken = decryptToken<string>(encrypted);
    if (typeof refreshToken !== "string" || !refreshToken) throw new Error("not a refresh token");
  } catch (err) {
    opts.log.warn({ err }, "apple.token_revoke.undecryptable");
    captureException(err, { tags: { apple: "token_revoke_decrypt" } });
    return "undecryptable";
  }
  try {
    await revokeAppleRefreshToken(refreshToken, config, opts);
    return "revoked";
  } catch (err) {
    opts.log.warn({ err }, "apple.token_revoke.failed");
    captureException(err, { tags: { apple: "token_revoke" } });
    return "failed";
  }
}
