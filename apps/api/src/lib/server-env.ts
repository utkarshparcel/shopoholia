import proxyAddr from "@fastify/proxy-addr";
import { WEB_ORIGIN } from "@worn/shared";
import { parseServiceAccount } from "./iap/google-play.js";
import { resolveEconomyMode } from "./orders/state-machine.js";
import { hasR2Config } from "./storage/r2.js";

type Env = Record<string, string | undefined>;

const DEV_JWT_SECRET = "dev-only-change-me";

/**
 * Secret for signing access tokens. JWT_ACCESS_SECRET is the documented name
 * (.env.example, @worn/config); JWT_SECRET is still read so existing setups keep working.
 */
export function resolveJwtSecret(env: Env = process.env): { secret: string; warning?: string } {
  // A blank or whitespace-only value counts as unset: tokens are never signed with an empty key.
  const secret = [env.JWT_ACCESS_SECRET, env.JWT_SECRET].find((value) => value?.trim());
  if (secret) return { secret };

  if (env.NODE_ENV === "production") {
    throw new Error("JWT_ACCESS_SECRET must be set in production");
  }
  return {
    secret: DEV_JWT_SECRET,
    warning: "JWT_ACCESS_SECRET not set — using dev fallback. Do not deploy.",
  };
}

/** PORT/HOST (set by most hosting platforms) win over the documented API_PORT/API_HOST. */
export function resolveListenAddress(env: Env = process.env): { port: number; host: string } {
  return {
    port: Number(env.PORT || env.API_PORT || 3000),
    host: env.HOST || env.API_HOST || "0.0.0.0",
  };
}

/**
 * Fastify's `trustProxy`: whose X-Forwarded-For to believe for `request.ip` (rate limits key
 * signed-out callers and sign-in by it). TRUST_PROXY is a hop count, `true`, `false`, or a
 * comma-separated list of proxy addresses/CIDRs. Unset, production trusts one hop (the host's load
 * balancer: Railway, Render and Fly all put one in front) and elsewhere nothing is trusted.
 * Undefined means the value is not understood.
 */
export function resolveTrustProxy(env: Env = process.env): boolean | number | string | undefined {
  const raw = env.TRUST_PROXY?.trim();
  if (raw === undefined || raw === "") return env.NODE_ENV === "production" ? 1 : false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (/^[0-9a-fA-F.:/]+(\s*,\s*[0-9a-fA-F.:/]+)*$/.test(raw)) return raw;
  return undefined;
}

/** Addresses a host's own load balancer connects from: private, loopback or carrier-grade NAT. */
const isInternalProxyAddress = proxyAddr.compile(["loopback", "linklocal", "uniquelocal", "100.64.0.0/10"]);

/**
 * resolveTrustProxy's value as Fastify's `trustProxy` option. Fastify 5.12 stopped honouring a bare
 * hop count (it fails closed, so request.ip became the proxy's and every signed-out caller shared one
 * rate-limit bucket): a hop count is now a function that trusts at most that many hops, and only
 * hops whose address is internal, so a client reaching the API directly from the internet can't
 * spoof X-Forwarded-For. A host whose balancer connects from public addresses sets TRUST_PROXY to
 * its CIDRs instead.
 */
export function fastifyTrustProxy(
  value: boolean | number | string | undefined,
): boolean | string | ((address: string, hop: number) => boolean) {
  if (typeof value !== "number") return value ?? false;
  return (address, hop) => hop < value && isInternalProxyAddress(address, hop);
}

/**
 * Browser origins allowed to call the API. Outside production every origin is allowed. In
 * production CORS_ORIGIN is one origin or a comma-separated list (`*` allows all); unset means
 * the website (Worn Play and Worn Closet share one origin).
 */
export function resolveCorsOrigin(env: Env = process.env): true | string | string[] {
  if (env.NODE_ENV !== "production") return true;
  const origins = (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) return WEB_ORIGIN;
  if (origins.includes("*")) return "*";
  return origins.length === 1 ? origins[0]! : origins;
}

/**
 * Settings that are missing or unsafe here. In production an error stops the boot: production never
 * runs on a mock. Warnings name what's unavailable (a store without settings answers 503).
 */
export function bootConfigProblems(env: Env = process.env): { errors: string[]; warnings: string[] } {
  const production = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  if (production) {
    if (!env.DATABASE_URL?.trim()) {
      errors.push("DATABASE_URL is not set: every account, order and coin would live in memory and vanish on restart");
    }
    if (!(env.JWT_ACCESS_SECRET?.trim() || env.JWT_SECRET?.trim())) {
      errors.push("JWT_ACCESS_SECRET is not set: access tokens can't be signed");
    }
    if ((env.PRIVACY_HMAC_SECRET ?? "").length < 16) {
      errors.push(
        "PRIVACY_HMAC_SECRET is not set (at least 16 characters): consent records and poll share links can't be keyed",
      );
    }
    if (env.TRUST_PROXY !== undefined && resolveTrustProxy(env) === undefined) {
      errors.push(`TRUST_PROXY=${env.TRUST_PROXY} is not understood: use a hop count, true, false or a list of addresses`);
    }
    if (!(env.GOOGLE_CLIENT_IDS ?? env.GOOGLE_CLIENT_ID)?.trim()) {
      warnings.push(
        "GOOGLE_CLIENT_IDS is not set: Google sign-in fails, and phone sign-in is off in production, so nobody can sign in",
      );
    }
    if (!env.REDIS_URL?.trim()) {
      warnings.push("REDIS_URL is not set: account deletion and data export answer 503, and the API worker can't start");
    }
    if (!env.FASHN_API_KEY?.trim()) {
      warnings.push("FASHN_API_KEY is not set: try-on and reveal renders are unavailable");
    }
    if (resolveEconomyMode(env) === "beta") {
      warnings.push("WORN_ECONOMY_MODE=beta: orders use the short beta delivery timers (minutes, not hours)");
    }
    if (!hasR2Config(env)) {
      errors.push("R2 storage is not configured (R2_*): uploads would go to an in-memory mock");
    }
    if (!(env.OCR_PROVIDER_URL ?? env.OCR_PROVIDER_ENDPOINT) || env.OCR_PROVIDER === "mock") {
      errors.push("OCR is not configured (OCR_PROVIDER_URL): receipts would be read by the mock");
    }
    if (!env.FASHN_API_KEY?.trim()) {
      warnings.push(
        "FASHN_API_KEY is not set: try-on previews, reveal unlocks and generates are unavailable (503), and every free reveal render fails",
      );
    }
    if (!env.WEATHER_API?.trim()) {
      warnings.push("WEATHER_API is not set: weather falls back to the mock (source: mock)");
    }
    if (!env.CASHBACK_WEBHOOK_SECRET?.trim()) {
      warnings.push("CASHBACK_WEBHOOK_SECRET is not set: affiliate cashback confirmations are refused");
    }
    if (!env.ADMIN_SECRET?.trim()) {
      warnings.push("ADMIN_SECRET is not set: admin routes (ops playbooks, marketplace settlements) are refused");
    }
    if (!env.GOOGLE_CLIENT_ID || !env.OAUTH_STATE_SECRET) {
      warnings.push("GOOGLE_CLIENT_ID or OAUTH_STATE_SECRET is not set: Gmail connect is unavailable (503)");
    }
    if (!env.REDIS_URL?.trim()) {
      warnings.push(
        "REDIS_URL is not set: the API worker can't run, so account-deletion retries (stored objects left after a storage error), data exports, store-purchase reconciliation and the Closet jobs never run, and every route that enqueues one answers 503",
      );
    }
    if (!(env.GOOGLE_CLIENT_IDS ?? env.GOOGLE_CLIENT_ID)?.trim()) {
      warnings.push(
        "GOOGLE_CLIENT_IDS is not set: Google sign-in answers 503 (phone sign-in is off in production, so only Sign in with Apple on iOS works)",
      );
    }
    if (!(env.APPLE_SIGN_IN_AUDIENCES ?? env.APPLE_BUNDLE_ID)?.trim()) {
      warnings.push("APPLE_BUNDLE_ID is not set: Sign in with Apple answers 503");
    }
    if (!env.FASHN_API_KEY?.trim()) {
      warnings.push("FASHN_API_KEY is not set: try-on and reveal renders fail, so orders never reach their reveal");
    }
    if (env.IAP_ACCEPT_TEST_PURCHASES === "0") {
      warnings.push(
        "IAP_ACCEPT_TEST_PURCHASES=0: Sandbox and license-tester purchases are refused, so App Review and TestFlight testers can't buy coins",
      );
    }
    if (env.IAP_ALLOW_SIMULATED === "1") warnings.push("IAP_ALLOW_SIMULATED=1 is ignored in production");
    if (env.IAP_ALLOW_XCODE === "1") warnings.push("IAP_ALLOW_XCODE=1 is ignored in production");
  }

  if (!env.APPLE_BUNDLE_ID?.trim()) {
    warnings.push("APPLE_BUNDLE_ID is not set: App Store purchases are unavailable (503)");
  }
  if (!env.ANDROID_PACKAGE_NAME?.trim() || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    warnings.push(
      "ANDROID_PACKAGE_NAME or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set: Google Play purchases are unavailable (503)",
    );
  } else if (!parseServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)) {
    warnings.push(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not a service-account key (client_email, private_key): Google Play purchases are unavailable (503)",
    );
  }
  if (!production && env.IAP_ALLOW_XCODE === "1" && !env.IAP_XCODE_CERT_PEM) {
    warnings.push("IAP_ALLOW_XCODE=1 needs IAP_XCODE_CERT_PEM (Xcode: Editor > Save Public Certificate)");
  }
  if (env.REVENUECAT_API_KEY || env.REVENUECAT_WEBHOOK_SECRET || env.FEATURE_REVENUECAT) {
    warnings.push("RevenueCat settings are no longer read: purchases are verified with Apple and Google directly");
  }
  return { errors, warnings };
}
