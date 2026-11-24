import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { APPLE_ISSUER, hashAppleNonce } from "./apple.js";

/** Tests only: Sign in with Apple keys, tokens and a fake for Apple's endpoints. */

/** A Sign in with Apple key pair: Apple's .p8 is a PKCS#8 P-256 key. */
export function appleSignInKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { publicKey, pem: privateKey.export({ format: "pem", type: "pkcs8" }).toString() };
}

/** Revocation settings for `pem`, the key written as a one-line env var (literal "\n"). */
export function appleRevocationEnv(pem: string, bundleId = "app.worncloset.play") {
  return {
    APPLE_BUNDLE_ID: bundleId,
    APPLE_TEAM_ID: "TEAM123456",
    APPLE_SIGN_IN_KEY_ID: "KEY1234567",
    APPLE_SIGN_IN_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
  };
}

/** Checks an ES256 client secret against the key and returns its header and claims. */
export function readClientSecret(secret: string, publicKey: KeyObject) {
  const [h, p, s] = secret.split(".") as [string, string, string];
  const valid = verify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url"),
  );
  return {
    valid,
    header: JSON.parse(Buffer.from(h, "base64url").toString()) as Record<string, unknown>,
    claims: JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, unknown>,
  };
}

/** A fetch that answers per URL and records each call's form body; any other URL throws. */
export function appleFetch(answers: Record<string, () => Response | Promise<Response>>) {
  const calls: Array<{ url: string; form: Record<string, string> }> = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, form: Object.fromEntries(new URLSearchParams(String(init?.body ?? ""))) });
    const answer = answers[url];
    if (!answer) throw new Error(`unexpected fetch ${url}`);
    return answer();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

/** An RSA key standing in for Apple's identity-token key, with its JWKS entry. */
export function appleIdentityKey(kid = "apple-test-1") {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, kty: "RSA", alg: "RS256", use: "sig" } };
}

/** A signed identity token for `aud`, valid now, carrying the hash of `rawNonce`. */
export function appleIdentityToken(
  key: ReturnType<typeof appleIdentityKey>,
  claims: { aud: string; sub: string; rawNonce: string; email?: string },
) {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "RS256", kid: key.kid })}.${b64({
    iss: APPLE_ISSUER,
    aud: claims.aud,
    sub: claims.sub,
    iat: nowSeconds - 10,
    exp: nowSeconds + 600,
    nonce: hashAppleNonce(claims.rawNonce),
    ...(claims.email ? { email: claims.email, email_verified: "true" } : {}),
  })}`;
  return `${head}.${sign("RSA-SHA256", Buffer.from(head), key.privateKey).toString("base64url")}`;
}
